/*
 * A parser for the Fried Circuits OLED Backpack
 *  This object contains two entries:
 *  - The low level parser for the serial port driver
 *  - The high level parser for incoming serial port data
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */

var serialport = require('serialport'),
    recorder = require('../recorder.js'),
    events = require('events'),
    outputmanager = require('../outputs/outputmanager.js');

var FCOled = function() {

    // Init the EventEmitter
    events.EventEmitter.call(this);

    /////////
    // Public variables
    /////////
    this.name = "fcoledv1";

    /////////
    // Private variables
    /////////
    var port = null;
    var isopen = false;
    var port_close_requested = false;
    var self = this;

    /////////
    // Private methods
    /////////

    var status = function(stat) {
        debug('Port status change', stat);
        isopen = stat.portopen;
        
        if (isopen) {
            // Should run any "onOpen" initialization routine here if
            // necessary.
        } else {
            // We remove the listener so that the serial port can be GC'ed
            if (port_close_requested) {
                port.removeListener('status', status);
                port_close_requested = false;
            }
        }
    };

    // How the device is connected on the serial port            
    var portSettings = function() {
        return  {
            baudRate: 115200,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            flowControl: false,
            // simply pass each line to our JSON streaming parser
            // Note: the Onyx outputs json with \n at the end, so
            // the default readline parser works fine (it separates on \r)
            parser: serialport.parsers.readline('\n'),
        }
    };

    // format should return a JSON structure.
    var format = function(data) {
        // console.log('FC Oled Backpack - format output');
        // Remove any carriage return
        data = data.replace('\n','');
        var fields = {};
        try {
            fields = JSON.parse(data);
        } catch (e) {
            console.log("Error: cannot parse logger data : " + e + " - " + data);
        }
        self.emit('data',fields);
        recorder.record(fields);
        outputmanager.output(fields);
    };

    /////////
    // Public methods
    /////////

    // Creates and opens the connection to the instrument.
    // for all practical purposes, this is really the init method of the
    // driver
    this.openPort = function(path) {
        port = new serialconnection(path, portSettings());
        port.on('data', format);
        port.on('status', status);
    }

    this.closePort = function(data) {
        // We need to remove all listeners otherwise the serial port
        // will never be GC'ed
        port.removeListener('data', format);
        port_close_requested = true;
        port.close();
    }

    this.setInstrumentRef = function(i) {
    };

    // Called when the HTML app needs a unique identifier.
    // this is a standardized call across all drivers.
    // This particular device does not support this concept, so we
    // always return the same
    this.sendUniqueID = function() {
        this.emit('data',{ uniqueID:'00000000 (n.a.)'});
    };

    this.isStreaming = function() {
        return true;
    };

    // period is in seconds
    // The sensor sends data by itself, so those functions are empty...
    this.startLiveStream = function(period) {
    };

    this.stopLiveStream = function(period) {
    };

    // output should return a string, and is used to format
    // the data that is sent on the serial port, coming from the
    // HTML interface.
    this.output = function(data) {
        port.write(data + '\n');
    }
};


FCOled.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = FCOled;