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
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 *
 */


/**
 *   Setup access to serial ports
 */
var serialport = require('serialport'),
    SerialPort  = serialport.SerialPort,
    PouchDB = require('pouchdb'),
    flash = require('connect-flash');



// Utility function to get a Hex dump
var Hexdump = require('./hexdump.js');
var Debug = false;

// Preload the parsers we know about:
var Fluke289 = require('./parsers/fluke289.js');
var Onyx = require('./parsers/safecast_onyx.js');
var FCOled = require('./parsers/fried_usb_tester.js');
var W433 = require('./parsers/w433.js');
var Elecraft = require('./parsers/elecraft.js');
var USBGeiger = require('./parsers/usb_geiger.js');

/**
 * Setup Db connection before anything else
 */
// Returns an object containing all databases we use
var dbs = require('./pouch-config.js');


/**
 * Setup our authentication middleware
 */
var passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    ConnectRoles = require('connect-roles');

var user = new ConnectRoles();

require('./config/passport')(passport); // Our Passport configuration
require('./config/roles')(user);        // Configure user roles

var jwt = require('jsonwebtoken');
var socketioJwt = require('socketio-jwt');

/**
 * Setup the HTTP server and routes
 */
var express = require('express'),
    instruments = require('./routes/instruments.js'),
    outputs = require('./routes/outputs.js'),
    deviceLogs = require('./routes/logs.js'),
    settings = require('./routes/settings.js'),
    backup = require('./routes/backup.js');

var app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server, { log: false });

app.configure(function () {
    app.use(express.logger('dev'));     // 'default', 'short', 'tiny', 'dev'
    app.use(express.cookieParser());    // passport authentication needs to read cookies
    app.use(express.favicon());         
    app.use(express.bodyParser({ keepExtensions: true }));
    
    app.set('view engine', 'ejs'); // Setup templating for login forms
    
    // Configure Passport
    app.use(express.session({secret: 'LKJQDHFGLKJHpiusdhfgpsidf!à§98769876654è§!ç' }));
    app.use(passport.initialize());
    app.use(passport.session());     // Persistent login sessions, makes user life easier
    app.use(flash());                // Flash messages upon login, stored in session
});



// Before starting our server, make sure we reset any stale authentication token:
dbs.settings.get('coresettings', function (err, item) {
    console.log(item);
    if (err) {
        console.log('Issue finding my own settings ' + err);
    }
    if (item == null) {
      item = dbs.defaults.settings;
    }

    item.token = "_invalid_";
    dbs.settings.put(item, 'coresettings', function(err,response) {
        if (err) {
            console.log('***** WARNING ****** Could not reset socket.io session token at server startup');
            console.log(err);
            return;
        }
        console.log(response);
        server.listen(8090);
    });
    
});


console.log("Listening for new clients on port 8090");
var connected = false;

/****************
 *   ROUTES
 ****************/

// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {
    
    // if user is authenticated in the session, carry on 
    if (req.isAuthenticated()) {
        if (req.user.role === 'pending') {
            res.render('profile.ejs', {user: req.user, message: 'Your account is created, access approval is pending.'});
            return;
        }
        return next();
    }

    // if they aren't redirect them to the login page
    res.redirect('/login');
}

/**
 *  Authentication: before anything else, make sure all
 * request to our root are authenticated:
 */

app.get ('/',
         isLoggedIn,
         function(req,res) {
             res.sendfile('www/index.html');
         });

app.get('/login', function(req, res) {
    // Before logging in, we need to make sure there are users defined on our system.
    dbs.users.info( function(err, info) {
      if (info.doc_count == 0) {
        var adm = dbs.defaults.user;
        adm.local.email = "admin";
        adm.local.password = dbs.utils.users.generateHash('admin');
        adm.role = 'admin';
        adm._id = 'admin'; // The userID has to be unique, we can use this as the CouchDB ID
        dbs.users.put(adm, function(err, response) {
           if (err)
                console.log("Error during first user creation " + err);
            console.log(response);
            res.render('login.ejs', { message: 'Welcome! Your default login/password is admin/admin'  });
       });
      } else {
       res.render('login.ejs', { message: req.flash('loginMessage') }); 
     }
    });
});
app.get('/signup', function(req,res) {
    res.render('signup.ejs', { message: req.flash('signupMessage')});
});
app.get('/logout', function(req,res) {
    req.logout();
    res.redirect('/');
});
// process the signup form
app.post('/signup', passport.authenticate('local-signup', {
    successRedirect : '/profile', // redirect to the secure profile section
    failureRedirect : '/signup',  // redirect back to the signup page if there is an error
    failureFlash : true           // allow flash messages
}));
// process the login form
app.post('/login', passport.authenticate('local-login', {
    failureRedirect : '/login', // redirect back to the signup page if there is an error
    failureFlash : true         // allow flash messages
}), function(req,res) {
    
    // If the login process generated a flash message, go to the warning page
    // first
    var w = req.flash('warningMessage');
    if (w != '') {
        console.log("Warning: " + w);
        res.render('warning.ejs', { message: w });
        return;
    }
    
    // We're good: we gotta generate a json web token
    var profile = {
        username: req.user.local.email,
        role: req.user.role
    };

    // we are sending the profile in the token
    var token = jwt.sign(profile, 'superSecretYesYesYes' + secret_salt);

    
    // Now store our token into the settings, so that the app can get it when it starts:
    dbs.settings.get('coresettings', function (err, item) {
        if (err) {
            console.log('Issue finding my own settings ' + err);
            res.redirect('/login');
        }
        item.token = token;
        dbs.settings.put(item, function(err) {
            if (err)
                res.redirect('/login');
            res.redirect('/');
        });
    });

    
});

app.get('/profile', isLoggedIn, function(req,res) {
    res.render('profile.ejs', { user: req.user, message: '' });
});
app.post('/profile', isLoggedIn, function(req,res) {
     dbs.users.get(req.user.local.email, function(err, record) {
         console.log(record);
         record.local.password = dbs.utils.users.generateHash(req.body.password);
         dbs.users.put(record, function(err) {
             var msg  = (err) ? 'Error changing password': 'Password changed';
             res.render('profile.ejs', {user: req.user, message: msg});
         });

     });
});

app.get('/admin', isLoggedIn, user.is('admin'), function(req,res) {
    dbs.users.allDocs({include_docs:true}, function(err, users) {
        res.render('admin.ejs', {user: req.user, users: users.rows, message: '' });
    });
});
app.post('/admin', isLoggedIn, user.is('admin'), function(req,res) {
    console.log(req.body);
    dbs.users.get( req.body.id, function(err, user) {
        var msg = "Role updated to " + req.body.newrole + " for user " + user.local.email;
        if (err)
            msg = "Someting went wrong, no change was made.";
        
        user.role = req.body.newrole;
        dbs.users.put(user, function(err) {
            if (err)
                msg = "Something went wrong, no change was made.";
            dbs.users.allDocs({include_docs:true}, function(err, users) {
                res.render('admin.ejs', {user: req.user, users: users.rows, message: msg });
            });
        });
    });
    
});


/**
 * Interface for managing instruments
 */
app.get('/instruments', isLoggedIn, instruments.findAll);
app.get('/instruments/:id', isLoggedIn, instruments.findById);
app.post('/instruments', isLoggedIn, user.is('operator'), instruments.addInstrument);
app.post('/instruments/:id/picture', isLoggedIn, user.is('operator'), instruments.uploadPic);
app.put('/instruments/:id', isLoggedIn, user.is('operator'), instruments.updateInstrument);
app.delete('/instruments/:id', isLoggedIn, user.is('operator'), instruments.deleteInstrument);

/**
 * Interface for managing output plugins. Outputs are only defined
 * relative to an instrument, which is reflected in the URL
 */
app.get('/instruments/:id/outputs', isLoggedIn, user.is('operator'), outputs.findByInstrumentId);
app.post('/instruments/:id/outputs', isLoggedIn, user.is('operator'), outputs.addOutput);
app.get('/instruments/:iid/outputs/:id', isLoggedIn, user.is('operator'), outputs.findById);
app.put('/instruments/:iid/outputs/:id', isLoggedIn, user.is('operator'), outputs.updateOutput);
app.delete('/instruments/:iid/outputs/:id', isLoggedIn, user.is('operator'), outputs.deleteOutput);

/**
 * Interface for managing instrument logs (summary)
 */
app.get('/instruments/:id/logs', isLoggedIn, deviceLogs.findByInstrumentId);
app.post('/instruments/:id/logs', isLoggedIn, user.is('operator'), deviceLogs.addLog);
app.get('/logs/', isLoggedIn, deviceLogs.findAll);
app.get('/logs/:id', isLoggedIn, deviceLogs.findById);
app.get('/logs/:id/entries', isLoggedIn, deviceLogs.getLogEntries);
app.put('/instruments/:iid/logs/:id', isLoggedIn, user.is('operator'), deviceLogs.updateEntry);
app.delete('/instruments/:idd/logs/:id', isLoggedIn, user.is('operator'), deviceLogs.deleteLog);
app.delete('/logs/:lid/entries/:id', isLoggedIn, user.is('operator'), deviceLogs.deleteLogEntry);


/**
 * Interface for extracting logs in json format
 *
 * /export/:id/:start/:end/:format (need API key in URL ?)
 *     Extract a particular log ID with a start & end timestamp
 * /live/:period : period being in minutes
 *     Get the current live recording for the last ':period'
 */
app.get('/live/:period', deviceLogs.getLive);
 

/**
 * Interface for our settings. Only one settings object,
 * so no getting by ID here. Note: I now mostly store settings
 * in-browser rather than on-server.
 */
app.get('/settings', isLoggedIn, settings.getSettings);
app.put('/settings', isLoggedIn, user.is('operator'),  settings.updateSettings);

/**
 * Interface for triggering a backup and a restore
 */
app.get('/backup', isLoggedIn, user.is('admin'), backup.generateBackup);
app.post('/restore', isLoggedIn, user.is('admin'), backup.restoreBackup);

// Our static resources are in 'www'
// GET /javascripts/jquery.js
// GET /style.css
// GET /favicon.ico
// Everything static should be authenticated: therefore we are inserting a checkpoint middleware
// at this point
app.use(function(req,res,next) {
    // console.log("*** checkpoint ***");
    if (req.isAuthenticated())
        return next();
    
    // We are allowing CSS and img folders
    if (req.path.indexOf("/css") == 0 || req.path.indexOf("/fonts") == 0)
        return next();
    
    res.redirect('/');
});

app.use(express.static(__dirname + '/www'));


/////////
// A small utility here (to be moved elswhere...)
/////////
//http://stackoverflow.com/questions/2454295/javascript-concatenate-properties-from-multiple-objects-associative-array
 
function Collect(ob1, ob1) {
    var ret = {},
    len = arguments.length,
    arg, i = 0, p;
 
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

var driver = null;

// Output plugin management: we have an outputmanager, whose role
// is to send data to various third parties (twitter, Safecast, HTTP REST calls
// etc... 
var outputmanager = require('./outputs/outputmanager.js');

//
// Backend logging: we want to let the backend record stuff into
// the database by itself, so we keep a global variable for doing this
var recorder = require('./recorder.js');

var recordingSessionId = 0; // Is set by the front-end when pressing the 'Record' button.

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
       if (driver.onClose) {
           driver.onClose(true);
       }
        socket.emit('status', {portopen: portOpen});
    });
}

//////////////////
// Socket management: supporting one client at a time for now
//////////////////

var secret_salt = new Date().getMilliseconds();

// Setup Socket.io authorization based on JSON Web Tokens so that we get
// authorization info from our login process:
io.use(socketioJwt.authorize({
  secret: 'superSecretYesYesYes' + secret_salt,
  handshake: true,
}));

// listen for new socket.io connections:
io.sockets.on('connection', function (socket) {
    
    var self = this;
    
    console.log(socket.decoded_token.role, 'connected');
    var userinfo = socket.decoded_token;
    
	// if the client connects:
	if (!connected) {
            console.log('User connected');
            connected = true;
    }
    
    // We want to listen for data coming in from drivers:
    var sendDataToFrontEnd = function(data) {
        console.log('data coming in for socket ' + socket.id, data);
        
        // Temporary: detect "uniqueID" key and send as 'uniqueID' message
        if (data.uniqueID) {
            socket.emit('uniqueID', data.uniqueID);
            return;
        }
        socket.emit('serialEvent', data);
    }
    
    // If we have an existing open port, we need to update the socket
    // reference for its driver:
    if (driver != null) {
        console.log('Driver name:',driver.name);
        driver.on('data',sendDataToFrontEnd);
    }
    
    
    socket.on('disconnect', function(data) {
        console.log('This socket got disconnected');
        if (driver != null) {
            console.log('Removing driver data callback');
            driver.removeListener('data',sendDataToFrontEnd);
        }
    });

    // Get information on the current user:
    //   - username
    //   - role
    //
    // Note: html5 UI will use this to remove some links that don't make sense
    // for certain roles, but this backend enforces access, not the HTML5 UI.
    socket.on('userinfo', function() {
        socket.emit('userinfo', userinfo);
    });

    // Open a port by instrument ID: this way we can track which
    // instrument is being used by the app.
    socket.on('openinstrument', function(data) {
        if (userinfo.role == 'operator' || userinfo.role == 'admin') {
            
            // TODO: need to find a way to query (something) and understand
            // whether the instrument is open
            
            console.log('Instrument open request for instrument ID ' + data);
            dbs.instruments.get(data, function(err,item) {
                currentInstrument = item;
                driver.setInstrumentRef(currentInstrument);
                openPort(item.port, socket);
            });
        } else
            console.log("Unauthorized attempt to open instrument");
    });
    
    // TODO: support multiple ports, right now we
    // discard 'data' completely.
    // I assume closing the port will remove
    // the listeners ?? NOPE! To be checked.
    socket.on('closeinstrument', function(data) {
        if (userinfo.role == 'operator' || userinfo.role == 'admin') {
            console.log('Instrument close request for instrument ID ' + data);
            dbs.instruments.get(data, function(err,item) {
                if(portOpen) {
                    recorder.stopRecording();
                    driver.stopLiveStream();
                    myPort.close();
                    portOpen = false;
                }
            });
        } else
            console.log("Unauthorized attempt to open instrument");
    });

    socket.on('portstatus', function() {
        var s = {portopen: portOpen, recording: recorder.isRecording(), streaming: (driver)? driver.isStreaming() : false};
        var ds = {};
        if (driver && driver.status)
            ds= driver.status();
        socket.emit('status', Collect(s,ds));
    });
        
    socket.on('controllerCommand', function(data) {
        if (Debug) console.log('Controller command: ' + data);
        if (portOpen)
            myPort.write(driver.output(data));
    });
    
    socket.on('startrecording', function(id) {
        recorder.startRecording(id);
    });
    
    socket.on('stoprecording', function() {
        recorder.stopRecording();
    });
    
    socket.on('startlivestream', function(data) {
        if (portOpen)
            driver.startLiveStream(data);
    });
    
    socket.on('stoplivestream', function() {
        if (portOpen)
            driver.stopLiveStream();
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
    
    socket.on('outputs', function(instrumentId) {
        console.log("[server.js]  Update the outputs for this instrument");
        outputmanager.enableOutputs(instrumentId);
    });

    socket.on('driver', function(data) {
        
        if (!(userinfo.role == 'operator' || userinfo.role == 'admin')) {
            console.log('Unauthorized attempt to change instrument driver');
            return;
        }
        console.log('Request to update our serial driver to ' + data);
        
        // No need to reselect the driver if it is already selected:
        if (driver && (data == driver.name))
            return;
        
        // If we already had a driver, we need to stop listening to events from
        // the old one so that it can be garbage collected
        if (driver != null) {
            driver.removeListener('data',sendDataToFrontEnd);
        }
        
        // Close the serial port if it is open and the driver has changed:
        if (portOpen && data != driver.name) {
            console.log("Driver changed! closing port");
            portOpen = false;
            myPort.close();
        }
        
        socket.emit('status', {portopen: portOpen, streaming: false, recording: false});
        
        // For now, we have only a few drivers, so let's just hardcode...
        if (data == "onyx") {
            driver = new Onyx();
        } else if ( data == "fcoledv1" ) {
            driver = new FCOled();
        } else if ( data == "fluke28x") {
            driver = new Fluke289();
        } else if ( data == "w433") {
            driver = new W433();
        } else if ( data == "elecraft") {
            driver = new Elecraft();
        } else if ( data == "usbgeiger") {
            driver = new USBGeiger();
        }
        
        // And listen for data coming in from our driver
        driver.on('data',sendDataToFrontEnd);
        
    });
    
});
    
