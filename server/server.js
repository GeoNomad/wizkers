/**
 * The Node.js backend server that communicates with the hardware and serves the
 * HTML web app.
 *
 * This server does several things:
 *
 * - Handles call to the various instruments on the local serial port.
 * - Parses instrument responses into JSON dta structures
 * - Does the actual recording of live logs
 * -
 *
 * (c) 2013 Edouard Lafargue, edouard@lafargue.name
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


/**
 *   Setup access to serial ports
 */
var serialport = require('serialport'),
    SerialPort  = serialport.SerialPort;



// Utility function to get a Hex dump
var Hexdump = require('./hexdump.js');
var Debug = false;


var deviceTypes = [];

// Preload the parsers we know about:

// TODO: automate this by parsing the "parsers" directory listing
var Fluke289 = require('./parsers/fluke289.js');
deviceTypes.push(Fluke289);

var Onyx = require('./parsers/safecast_onyx.js');
deviceTypes.push(Onyx);

var FCOled = require('./parsers/fried_usb_tester.js');
deviceTypes.push(FCOled);

var W433 = require('./parsers/w433.js');
deviceTypes.push(W433);

var Elecraft = require('./parsers/elecraft.js');
deviceTypes.push(Elecraft);


/**
 * Debug: get a list of available serial
 * ports on the server - we'll use this later
 * to populate options on controller settings
 * on the application
 */
serialport.list(function (err, ports) {
    ports.forEach(function(port) {
      console.log(port.comName);
      console.log(port.pnpId);
      console.log(port.manufacturer);
    });
  });

/**
 * Setup Db connection before anything else
 */
require('./db.js');


var mongoose = require('mongoose');
var Instrument = mongoose.model('Instrument');

/**
 * Setup the HTTP server and routes
 */
var express = require('express'),
    instruments = require('./routes/instruments.js'),
    deviceLogs = require('./routes/logs.js');
    settings = require('./routes/settings.js'),
    backup = require('./routes/backup.js');
//    audio = require('./routes/audio.js');



var app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server, { log: false });

app.configure(function () {
    app.use(express.logger('dev'));     /* 'default', 'short', 'tiny', 'dev' */
    app.use(express.favicon()); // Test please
    app.use(express.bodyParser({ keepExtensions: true }));
});

server.listen(8080);
console.log("Listening for new clients on port 8080");
var connected = false;

/**
 * Interface for managing instruments
 */
app.get('/instruments', instruments.findAll);
app.get('/instruments/:id', instruments.findById);
app.post('/instruments', instruments.addInstrument);
app.post('/instruments/:id/picture', instruments.uploadPic);
app.put('/instruments/:id', instruments.updateInstrument);
app.delete('/instruments/:id', instruments.deleteInstrument);

/**
 * Interface for managing instrument logs (summary)
 *
 */
app.get('/instruments/:id/logs', deviceLogs.findByInstrumentId);
app.post('/instruments/:id/logs', deviceLogs.addEntry);
app.get('/logs/', deviceLogs.findAll);
app.get('/logs/:id', deviceLogs.findById);
app.get('/logs/:id/entries', deviceLogs.getLogEntries);
app.post('/logs/:id/entries', deviceLogs.addLogEntry);
app.put('/instruments/:iid/logs/:id', deviceLogs.updateEntry);
app.delete('/instruments/:idd/logs/:id', deviceLogs.deleteEntry);
app.delete('/logs/:lid/entries/:id', deviceLogs.deleteLogEntry);


/**
 * Interface for our settings. Only one settings object,
 * so no getting by ID here
 */
app.get('/settings', settings.getSettings);
app.put('/settings/:id', settings.updateSettings);

/**
 * Interface for triggering a backup and a restore
 */
app.get('/backup', backup.generateBackup);
app.post('/restore', backup.restoreBackup);


/**
 *  Interface to stream audio. This is 100% experimental
 */
//app.get('/audio', audio.start);


// Our static resources are in 'public'
// GET /javascripts/jquery.js
// GET /style.css
// GET /favicon.ico
app.use(express.static(__dirname + '/public'));

// TODO:
//
//  - Create a route to get the list of all device types in JSON, with index

//app.get('/protocols', '');


/////////
// A small utility here (to be moved elswhere...)
/////////
//http://stackoverflow.com/questions/2454295/javascript-concatenate-properties-from-multiple-objects-associative-array
 
function Collect(ob1, ob1) {
    var ret = {},
    len = arguments.length,
    arg,
    i = 0,
    p;
 
    for (i = 0; i < len; i++) {
      arg = arguments[i];
      if (typeof arg !== "object") {
        continue;
      }
      for (p in arg) {
        if (arg.hasOwnProperty(p)) {
          ret[p] = arg[p];
        }
      }
    }
    return ret;
}
 



//
// For now, we are supporting only one communication
// port on the server, but in the future we need to
// extend this to support multiple simultaneous
// connections to several devices.
var portsList = new Array();
var myPort = null;
var portOpen = false;

var driver = Onyx;

//
// Backend logging: we want to let the backend record stuff into
// the database by itself, so we keep a global variable for doing this
var recorder = require('./recorder.js');

var recordingSessionId = 0; // Is set by the front-end when pressing the 'Record' button.
app.get('/startrecording/:id', recorder.startRecording);
app.get('/stoprecording', recorder.stopRecording);

//
// In order to be more flexible, we are also going to keep track globally of a few things
// such as the currently selected instrument. At the moment there is no good way to know
// server-side that an instrument is selected, unfortunately.
var currentInstrument = null;


//////////////////
// Port management
//////////////////
openPort = function(data, socket) {
     //  This opens the serial port:
    if (myPort && portOpen) {
           try { 
               myPort.close();
           } catch (e) { console.log("Port close attempt error: " + e); }
	}
    
    myPort = new SerialPort(data,
                            driver.portSettings(),
                            true, 
                            function(err, result) {
                                if (err) {
                                    console.log("Open attempt error: " + err);
                                    socket.emit('status', {portopen: portOpen});
                                }
                            });    
    console.log('Result of port open attempt:'); console.log(myPort);
        
    // Callback once the port is actually open: 
   myPort.on("open", function () {
       console.log('Port open');
       myPort.flush(function(err,result){ console.log(err + " - " + result); });
       myPort.resume();
       portOpen = true;
       driver.setPortRef(myPort); // We need this for drivers that manage a command queue...
       driver.setSocketRef(socket);
       driver.setRecorderRef(recorder);
       if (driver.onOpen) {
           driver.onOpen(true);
       }
       socket.emit('status', {portopen: portOpen});
   });

    // listen for new serial data:
   myPort.on('data', function (data) {
       // if (Debug) console.log('.');
       // Pass this data to on our driver
       if (Debug) { try {
            // console.log('Raw input:\n' + Hexdump.dump(data));
           console.log("Data: " + data);
       } catch(e){}}
        driver.format(data);
   });
    
    myPort.on('error', function(err) {
        console.log("Serial port error: "  + err);
        portOpen = false;
       if (driver.onClose) {
           driver.onClose(true);
       }
        socket.emit('status', {portopen: portOpen});
    });
        
    myPort.on("close", function() {
        console.log("Port closing");
        console.log(myPort);
        portOpen = false;
       driver.setPortRef(null);
       driver.setSocketRef(null);
       driver.setRecorderRef(null);
       if (driver.onClose) {
           driver.onClose(true);
       }
        socket.emit('status', {portopen: portOpen});
    });
}



//////////////////
// Socket management: supporting one client at a time for now
//////////////////


// listen for new socket.io connections:
io.sockets.on('connection', function (socket) {
	// if the client connects:
	if (!connected) {
            console.log('User connected');
            connected = true;
    }
    
    // If we have an existing open port, we need to update the socket
    // reference for its driver:
    if (portOpen && driver != null) {
       driver.setSocketRef(socket);
    }

    // Open a port by instrument ID: this way we can track which
    // instrument is being used by the app.
    socket.on('openinstrument', function(data) {
        console.log('Instrument open request for instrument ID ' + data);
        Instrument.findById(data, function(err,item) {
            currentInstrument = item;
            driver.setInstrumentRef(currentInstrument);
            openPort(item.port, socket);
        });
    });
    
    // TODO: support multiple ports, right now we
    // discard 'data' completely.
    // I assume closing the port will remove
    // the listeners ?? NOPE! To be checked.
    socket.on('closeinstrument', function(data) {
        console.log('Instrument close request for instrument ID ' + data);
        Instrument.findById(data, function(err,item) {
            if(portOpen) {
                myPort.close();
                portOpen = false;
            }
        });
        
    });
        
    socket.on('portstatus', function() {
        var s = {portopen: portOpen, recording: recorder.isRecording()};
        var ds = {};
        if (driver.status)
            ds= driver.status();
        socket.emit('status', Collect(s,ds));
    });
        
    socket.on('controllerCommand', function(data) {
        // TODO: do a bit of sanity checking here
        if (Debug) console.log('Controller command: ' + data);
        if (portOpen)
            myPort.write(driver.output(data));
    });
    
    // Request a unique identifier to our driver
    socket.on('uniqueID', function() {
        console.log("Unique ID requested by HTML app");
        driver.sendUniqueID();
    });

    // Return a list of serial ports available on the
    // server    
    socket.on('ports', function() {
        console.log('Request for a list of serial ports');
        serialport.list(function (err, ports) {
            var portlist = [];
            for (var i=0; i < ports.length; i++) {
                portlist.push(ports[i].comName);
            }
            socket.emit('ports', portlist);
        });
     });

    socket.on('driver', function(data) {
        console.log('Request to update our serial driver to ' + data);
        
        // Close the serial port if it is open and the driver has changed:
        if (portOpen && data != driver.name) {
            console.log("Driver changed! closing port");
            portOpen = false;
            myPort.close();
        }
        
        socket.emit('status', {portopen: portOpen});
        
        // For now, we have only a few drivers, so let's just hardcode...
        if (data == "onyx") {
            driver = Onyx;
        } else if ( data == "fcoledv1" ) {
            driver = FCOled;
        } else if ( data == "fluke28x") {
            driver = Fluke289;
        } else if ( data == "w433") {
            driver = W433;
        } else if ( data == "elecraft") {
            driver = Elecraft;
        }
        
    });
    
});
