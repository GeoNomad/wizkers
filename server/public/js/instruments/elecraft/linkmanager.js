/**
 * The controller communication manager:
 *  - manages the socket.io link
 *  - provides API to the backend device to use by views
 *
 */


// linkManager is a reference to the parent link manager
var ElecraftLinkManager = function(linkManager) {

    var self = this;
    var lm = linkManager;


    //////
    //  Standard API:
    // All link managers need this function:
    //////
    this.setBackendDriver = function() {
        lm.socket.emit('driver','elecraft');
    }

    // This instrument always streams its data!
    this.startLiveStream = function() {
        return true; 
    }
        
    this.stopLiveStream = function() {
        return false;
    }
    
    
    //////
    // End of standard API
    //////
    
    // All commands below are fully free and depend on
    // the instrument's capabilities
    
    this.screen = function(n) {
        lm.socket.emit('controllerCommand', 'S:' + n);
    }

    
    
    
    console.log('Started Elecraft link manager driver..');

}

