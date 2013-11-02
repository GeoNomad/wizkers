// https://github.com/jamesp/node-nmea
// A parser for the NMEA GPS units
// the idea here is to display location on a map + the satellites on an
// almanach view. Nothing super fancy, but useful nevertheless.

//////////
//
//    WORK IN PROGRESS
//
//////////


// This object contains two entries:
//  - The low level parser for the serial port driver
//  - The high level parser for incoming serial port data

var serialport = require('serialport'),
    SerialPort  = serialport.SerialPort;

module.exports = {
    
    // Set a reference to the socket.io socket and port
    socket: null,
    recorder: null,
    
    setPortRef: function(s) {
    },
    setSocketRef: function(s) {
        this.socket = s;
    },
    setRecorderRef: function(s) {
        this.debug("Setting recorder reference.");
        this.recorder = s;
    },
    setInstrumentRef: function(i) {
    },




    // How the device is connected on the serial port            
    portSettings: {
            baudRate: 115200,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            flowControl: false,
            // simply pass each line to our JSON streaming parser
            // Note: the Onyx outputs json with \n at the end, so
            // the default readline parser works fine (it separates on \r)
            parser: serialport.parsers.readline('\n'),
    },
    
    // Called when the HTML app needs a unique identifier.
    // this is a standardized call across all drivers.
    // This particular device does not support this concept, so we
    // always return the same
    sendUniqueID: function() {
        this.socket.emit('uniqueID','00000000 (n.a.)');
    },

        
    // format should return a JSON structure.
    format: function(data, recording) {
        // console.log('FC Oled Backpack - format output');
        // Remove any carriage return
        data = data.replace('\n','');
        var fields = data.split(':');
        // Format is :Vbus:Abus:Vload:Aload:
        // We only return the load values:
        var res = { "v": fields[3], "a": fields[4] };
        this.socket.emit('serialEvent',res);
    },
    
    // output should return a string, and is used to format
    // the data that is sent on the serial port, coming from the
    // HTML interface.
    output: function(data) {
        return data + '\n';
    }

};
