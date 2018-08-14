module.exports = (app) => {

    const audioContext = new AudioContext()

    let meter = null
    let volumeLib = require('./lib')
    let canvasContext, canvasElement
    /**
    * @memberof fg.components
    */
    const Soundmeter = {
        destroyed: function() {
            // Stop the volume meter.
            window.cancelAnimationFrame(this.rafID)
        },
        methods: Object.assign({
            drawLoop: function(time) {
                // clear the background
                canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height)
                if (meter.checkClipping()) {
                    canvasContext.fillStyle = '#d9534f'
                } else {
                    canvasContext.fillStyle = '#28ca42'
                }

                canvasContext.fillRect(0, 0, meter.volume * canvasElement.width * 2.4, canvasElement.height)
                this.rafID = window.requestAnimationFrame(this.drawLoop)
            },
            updateSoundmeter: async function() {
                this.stream = await navigator.mediaDevices.getUserMedia(app.media._getUserMediaFlags())
                const mediaStreamSource = audioContext.createMediaStreamSource(this.stream)
                meter = volumeLib.createAudioMeter(audioContext)
                mediaStreamSource.connect(meter)
            },
        }, app.helpers.sharedMethods()),
        mounted: async function() {
            canvasElement = this.$refs.meter
            canvasContext = canvasElement.getContext('2d')
            try {
                this.stream = await navigator.mediaDevices.getUserMedia(app.media._getUserMediaFlags())
                const mediaStreamSource = audioContext.createMediaStreamSource(this.stream)
                meter = volumeLib.createAudioMeter(audioContext)
                mediaStreamSource.connect(meter)
                this.drawLoop()

            } catch (err) {
                app.setState({settings: {webrtc: {media: {permission: false}}}})
            }
        },
        render: templates.soundmeter.r,
        staticRenderFns: templates.soundmeter.s,
        store: {
            devices: 'settings.webrtc.devices',
            settings: 'settings',
        },
        watch: {
            'devices.ready': async function(isReady) {
                if (isReady) this.updateSoundmeter()
            },
            /**
            * Reinitialize the soundmeter when the
            * input device changes.
            */
            'devices.sinks.headsetInput.id': async function() {
                this.updateSoundmeter()
            },
        },
    }

    return Soundmeter
}
