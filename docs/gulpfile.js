const {_extend, promisify} = require('util')
const fs = require('fs').promises

const childExec = require('child_process').exec
const path = require('path')

const addsrc = require('gulp-add-src')
const flatten = require('gulp-flatten')
const ghPages = require('gulp-gh-pages')
const gulp = require('gulp-help')(require('gulp'), {})
const gutil = require('gulp-util')
const ifElse = require('gulp-if-else')
const imagemin = require('gulp-imagemin')
const livereload = require('gulp-livereload')
const mkdirp = promisify(require('mkdirp'))
const runSequence = require('run-sequence')
const size = require('gulp-size')
const template = require('gulp-template')

const Helpers = require('../tools/helpers')

// Force the build target here, so we can keep the gulp helpers generic.
let settings = require('../tools/settings')(__dirname, {
    BUILD_TARGET: 'docs',
})

const helpers = new Helpers(settings)


gulp.task('assets', 'Copy <brand> assets to <target>.', () => {
    const robotoPath = path.join(settings.NODE_PATH, 'roboto-fontface', 'fonts', 'roboto')
    return gulp.src(path.join(robotoPath, '{Roboto-Light.woff2,Roboto-Regular.woff2,Roboto-Medium.woff2}'))
        .pipe(flatten({newPath: './fonts'}))
        .pipe(addsrc(
            path.join(settings.ROOT_DIR, 'src', 'brand', settings.BRAND_TARGET, 'img', '{*.icns,*.png,*.jpg,*.gif}'),
            {base: path.join(settings.ROOT_DIR, 'src', 'brand', settings.BRAND_TARGET)},
        ))
        .pipe(ifElse(settings.PRODUCTION, imagemin))
        .pipe(gulp.dest(path.join(settings.BUILD_DIR)))
        .pipe(size(_extend({title: 'assets'}, settings.SIZE_OPTIONS)))
        .pipe(ifElse(settings.LIVERELOAD, livereload))
})


gulp.task('build', 'Generate documentation website.', (done) => {
    runSequence([
        // 'code',
        'assets',
        'html',
        'js-app',
        'js-vendor',
        'scss-app',
        'scss-vendor',
        'templates',
        'pages',
    ], ['screenshots'], () => {done()})
})

gulp.task('code', 'Generate code documentation as JSON.', (done) => {
    const commandPart1 = `node ${settings.NODE_PATH}/jsdoc/jsdoc.js ${settings.ROOT_DIR}src`
    const commandPart2 = `-c ${settings.ROOT_DIR}.jsdoc.json -d ${settings.BUILD_DIR}/docs`
    const command = `${commandPart1}${commandPart2}`
    childExec(command, {}, (err, stdout, stderr) => {
        if (stderr) gutil.log(stderr)
        if (stdout) gutil.log(stdout)
        if (settings.LIVERELOAD) livereload.changed('code.js')
        done()
    })
})


gulp.task('html', 'Generate HTML index file.', () => {
    // The index.html file is shared with the electron build target.
    // Appropriate scripts are inserted based on the build target.
    return gulp.src(path.join('src', 'index.html'))
        .pipe(template({settings}))
        .pipe(flatten())
        .pipe(gulp.dest(path.join(settings.BUILD_DIR)))
        .pipe(ifElse(settings.LIVERELOAD, livereload))
})


gulp.task('js-app', 'Generate app JavaScript.', (done) => {
    helpers.jsEntry('./src/js/index.js', 'app').then(() => {
        if (settings.LIVERELOAD) livereload.changed('app.js')
        done()
    })
})


gulp.task('js-vendor', 'Generate vendor JavaScript.', [], (done) => {
    helpers.jsEntry('./src/js/vendor.js', 'vendor').then(() => {
        if (settings.LIVERELOAD) livereload.changed('docs.js')
        done()
    })
})


gulp.task('publish', 'Publish documentation to Github pages.', ['docs'], () => {
    return gulp.src(path.join(settings.BUILD_DIR, '**', '*')).pipe(ghPages())
})


gulp.task('screenshots', 'Generate userstory screenshots.', (done) => {
    gutil.log('Generating screenshots, hold on...')
    let execCommand = `SCREENS=1 BRAND=${settings.BRAND_TARGET} gulp test-browser`
    childExec(execCommand, {cwd: settings.ROOT_DIR}, (err, stdout, stderr) => {
        done()
    })
})


gulp.task('pages', 'Generate topics JSON.', async(done) => {
    const description = JSON.parse((await fs.readFile('src/topics/topics.json')))

    let developerFiles = await Promise.all(description.topics.developer.map((i) => fs.readFile(`src/topics/developer/${i.name}.vue`)))
    let userFiles = await Promise.all(description.topics.user.map((i) => fs.readFile(`src/topics/user/${i.name}.vue`)))

    let data = {
        topics: {
            developer: [],
            user: [],
        },
    }

    for (const [i, file] of developerFiles.entries()) {
        let topic = description.topics.developer
        data.topics.developer.push({content: file.toString('utf8'), name: topic[i].name, title: topic[i].title})
    }

    for (const [i, file] of userFiles.entries()) {
        let topic = description.topics.user
        data.topics.user.push({content: file.toString('utf8'), name: topic[i].name, title: topic[i].title})
    }

    await mkdirp(path.join(settings.BUILD_DIR, 'js'))
    fs.writeFile(path.join(settings.BUILD_DIR, 'js', 'pages.js'), `window.pages = ${JSON.stringify(data)}`)
    if (settings.LIVERELOAD) livereload.changed('pages.js')
})


gulp.task('scss-app', 'Generate documentation CSS.', (done) => {
    const entryExtra = [path.join(settings.SRC_DIR, 'components', '**', '*.scss')]
    return helpers.scssEntry(path.join(settings.SRC_DIR, 'scss', 'app.scss'), !settings.PRODUCTION, entryExtra)
})


gulp.task('scss-vendor', 'Generate vendor CSS.', () => {
    const entryExtra = [path.join(settings.NODE_PATH, 'highlight.js', 'styles', 'atom-one-dark.css')]
    return helpers.scssEntry('./src/scss/vendor.scss', !settings.PRODUCTION, entryExtra)
})


gulp.task('templates', 'Generate Vue component templates.', () => {
    return helpers.compileTemplates('./src/components/**/*.vue')
})


gulp.task('watch', 'Run developer watch modus.', () => {
    helpers.startDevService({port: 9000})
    gulp.watch(path.join(settings.SRC_DIR, 'index.html'), ['html'])
    gulp.watch([
        path.join(settings.SRC_DIR, 'components', '**', '*.scss'),
        path.join(settings.SRC_DIR, 'scss', '**', '*.scss'),
        `!${path.join(settings.SRC_DIR, 'scss', 'vendor.scss')}`,
    ], ['scss-app'])

    gulp.watch([
        // Also watch for changes from Vialer-js App framework.
        path.join(settings.ROOT_DIR, 'src', 'js', '**', '*.js'),
        path.join(settings.SRC_DIR, 'components', '**', '*.js'),
        path.join(settings.SRC_DIR, 'js', '**', '*.js'),
        `!${path.join(settings.SRC_DIR, 'js', 'vendor.js')}`,
    ], ['js-app'])

    gulp.watch([path.join(settings.SRC_DIR, 'js', 'vendor.js')], ['js-vendor'])
    gulp.watch(path.join(settings.SRC_DIR, 'scss', 'vendor.scss'), ['scss-vendor'])
    gulp.watch([
        path.join(settings.SRC_DIR, 'topics', 'topics.json'),
        path.join(settings.SRC_DIR, 'topics', '**', '*.vue'),
    ], ['pages'])
    gulp.watch([path.join(settings.SRC_DIR, 'components', '**', '*.vue')], ['templates'])
})
