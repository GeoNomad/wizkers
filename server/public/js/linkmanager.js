/**
 * This is the link manager: it will use its low-level driver
 * for sending commands to instruments and parsing responses
 *
 */


var linkManager = function() {

    var self = this;
    this.socket = io.connect(); // (we connect on same host, we don't need a URL)
    
    this.connected = false;
    this.streaming = false;
    this.lastInput = 0;
    
    this.driver = null;
    
    this.setDriver = function(driver) {
        this.driver = driver;
        
        // Todo: we need to set the backend driver there too
        this.driver.setBackendDriver();
        
        console.log('Link manager: updated link manager driver for current instrument');
    }
    
    // Careful: in those functions, "this" is the socket.io context,
    // hence the use of self.
    this.processInput = function(data) {
        self.trigger('input', data);
        self.lastInput = new Date().getTime();
    };
    
    this.processStatus = function(data) {
        if (data.portopen) {
            self.connected = true;
        } else {
            self.connected = false;
        }
        // Tell anyone who would be listening that status is updated
        self.trigger('status', data);
    }
        
    this.controllerCommandResponse = function() {
    }
    
    this.requestStatus = function(data) {
        this.socket.emit('portstatus','');
    }
    
    this.openPort = function(port) {
        this.socket.emit('openport',port);
    }
    
    this.closePort = function(port) {
        this.stopLiveStream();
        this.socket.emit('closeport',port);
    }
    
    
    this.wdCall = function() {
        var ts = new Date().getTime();
        if ((ts-this.lastInput) > 5000)
            this.requestStatus();
    }
    
    this.startLiveStream = function() {
        this.driver.startLiveStream();
    }

    this.stopLiveStream = function() {
        this.driver.stopLiveStream();
    }
    
    this.manualCommand = function(cmd) {
        this.socket.emit('controllerCommand', cmd);
    }
    
    // Initialization code:
    this.socket.on('serialEvent', this.processInput);
    this.socket.on('status', this.processStatus);
    // Initialize connexion status on the remote controller
    this.socket.emit('portstatus','');
    // Start a 3-seconds interval watchdog to listen for input:
    // if no input in the last 2 seconds, then request port status
    this.watchdog = setInterval(this.wdCall.bind(this), 5000);    
}

// Add event management to our link manager, from the Backbone.Events class:
_.extend(linkManager.prototype, Backbone.Events);
