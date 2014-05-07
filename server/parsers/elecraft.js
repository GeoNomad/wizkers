/*
 * Parser for Elecraft radios
 *
 * This parser implements elecraft serial commands for:
 *    - KXPA100
 *    - KX3
 * 
 * At this stage, I am not recording anything on those instruments, but I still
 * need to implement the API.
 * 
 */
var serialport = require('serialport'),
    readline = require('readline'),
    net = require('net');

module.exports = {
    
    name: "elecraft",
    uidrequested: false,
    
    // A few driver variables: we keep track of a few things
    // here for our bare-bones rigctld implementation.
    //
    // Note: we do not poll for those values ourselves, we
    // count on the UI to do this - to be reviewed later if
    // necessary...
    vfoa_frequency: 0,
    vfob_frequency: 0,
    vfoa_bandwidth: 0,
    
    // Do we have a TCP client connected ?
    serverconnected: false,
        
    // Set a reference to the socket.io socket and port
    socket: null,
    recorder: null,
    port: null,
    
    setPortRef: function(s) {
        this.port = s;
    },
    setSocketRef: function(s) {
        this.socket = s;
    },
    setRecorderRef: function(s) {
        this.recorder = s;
    },
    setInstrumentRef: function(i) {
    },
        
    // How the device is connected on the serial port.
    // This HAS to be a function that returns a new port settings objet, and not
    // a static object, otherwise multiple port open/close will fail because the portSettings
    // object is changed by SerialPort and its reference become obsolete when closing/reopening...
    portSettings:  function() {
        return  {
            baudRate: 38400,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            flowControl: false,
            // We get non-printable characters on some outputs, so
            // we have to make sure we use "binary" encoding below,
            // otherwise the parser will assume Unicode and mess up the
            // values.
            parser: serialport.parsers.readline(';','binary'),
        }
    },
    
    // Called when the HTML app needs a unique identifier.
    // this is a standardized call across all drivers.
    // 
    // Returns the Radio serial number.
    sendUniqueID: function() {
        this.uidrequested = true;
        try {
            this.port.write("MN026;ds;MN255;");
        } catch (err) {
            console.log("Error on serial port while requesting Elecraft UID : " + err);
        }
    },

        
    // Format returns an ASCII string - or a buffer ? Radio replies with
    // non-ASCII values on some important commands (VFO A text, Icons, etc)
    format: function(data, recording) {
        
        if (this.uidrequested && data.substr(0,5) == "DS@@@") {
            // We have a Unique ID
            console.log("Sending uniqueID message");
            this.socket.emit('uniqueID','' + data.substr(5,5));
            this.uidrequested = false;
            return;
        }
        
        var cmd = data.substr(0,2);
        switch(cmd) {
                case "FA":
                    this.vfoa_frequency = parseInt(data.substr(2));
                    break;
                case "BW":
                    this.vfoa_bandwidth = parseInt(data.substr(2));
                    break;
        }
        var lcmd = data.substr(0,3);
        if (cmd != "DB" && cmd != "DS" && cmd != "PO" && lcmd != "^PI" && lcmd != "^PF" && lcmd != "^TM" &&
            lcmd != "^PV" && lcmd != "^PC" && lcmd != "^SV"  && cmd != "BN" ) {
            // Additional output besides regular polling, print it
            console.log("******  " + data);
        }
        
        this.socket.emit('serialEvent',data);
        //this.recorder.record(fields);
    },
    
    // output should return a string, and is used to format
    // the data that is sent on the serial port, coming from the
    // HTML interface.
    output: function(data) {
        return data;
    },
        
    // Status returns an object that is concatenated with the
    // global server status
    status: function() {
        return { tcpserverconnect: this.serverconnected };
    },
    
    // We serve rigctld commands through a TCP socket too:    
    onOpen: function(success) {
        var self = this;
        console.log("Elecraft Driver: got a port open signal");
        if (this.server == null) {
            this.server = net.createServer(function(c) { //'connection' listener
                console.log('server connected');
                self.socket.emit('status',{ tcpserverconnect: true });
                self.serverconnected = true;
                
                c.on('end', function() {
                    console.log('Server disconnected');
                    self.socket.emit('status',{ tcpserverconnect: false });
                    self.serverconnected = false;
                });
                var rl = readline.createInterface(c,c);
                rl.on('line', function(data) {
                    self.rigctl_command(data,c);
                });
            });
        }
        this.server.listen(4532, function() { //'listening' listener
            console.log('Rigctld emulation server started');
        });
    },
    
    onClose: function(success) {
        console.log("Closing TCP rigctld emulation server");
        if (this.server)
            this.server.close();
    },
    
    // RIGCTLD Emulation - super light, but does the trick for fldigi...
    rigctl_command: function(data,c) {
        // console.log(data);
        var cmd = data.substr(0,2);
        switch (cmd) {
                case "\\d": // "mp_state":
                    // No f**king idea what this means, but it makes hamlib happy.
                    c.write(this.hamlib_init);
                    break;                
                case "f":
                    c.write(this.vfoa_frequency + "\n");
                    break;
                case "F ": // Set Frequency (VFOA):  F 14069582.000000
                    var freq = ("00000000000" + parseFloat(data.substr(2)).toString()).slice(-11); // Nifty, eh ?
                    
                    console.log("Rigctld emulation: set frequency to " + freq);
                    if (this.port != null)
                        this.port.write("FA" + freq + ";");
                    c.write("RPRT 0\n");
                    break;
                case "m":
                     c.write("PKTUSB\n");
                     c.write(this.vfoa_bandwidth + "\n");
                    break;
                case "q":
                    // TODO: we should close the socket here ?
                    console.log("Rigctld emulation: quit");
                    break;
                case "v": // Which VFO ?
                    c.write("VFOA\n");
                    break;
                case "T ":
                    if (data.substr(2) == "1") {
                        if (this.port != null)
                            this.port.write('TX;');
                        // The radio does not echo this command, so we do it
                        // ourselves, so that the UI reacts
                        if (this.socket != null)
                            this.socket.emit('serialEvent','TX;');
                     
                    } else {
                        if (this.port != null)
                            this.port.write("RX;");
                        if (this.socket != null)
                            this.socket.emit('serialEvent','RX;');
                    }
                    c.write("RPRT 0\n");
                    break;
                default:
                    console.log("Unknown command: " + data);
                
        }
        
    },
    
    hamlib_init: "0\n\
229\n\
2\n\
500000.000000 30000000.000000 0xdbf -1 -1 0x3 0x3\n\
48000000.000000 54000000.000000 0xdbf -1 -1 0x3 0x3\n\
0 0 0 0 0 0 0\n\
1800000.000000 2000000.000000 0xdbf 10 10000 0x3 0x3\n\
3500000.000000 4000000.000000 0xdbf 10 10000 0x3 0x3\n\
7000000.000000 7300000.000000 0xdbf 10 10000 0x3 0x3\n\
10100000.000000 10150000.000000 0xdbf 10 10000 0x3 0x3\n\
14000000.000000 14350000.000000 0xdbf 10 10000 0x3 0x3\n\
18068000.000000 18168000.000000 0xdbf 10 10000 0x3 0x3\n\
21000000.000000 21450000.000000 0xdbf 10 10000 0x3 0x3\n\
24890000.000000 24990000.000000 0xdbf 10 10000 0x3 0x3\n\
28000000.000000 29700000.000000 0xdbf 10 10000 0x3 0x3\n\
50000000.000000 54000000.000000 0xdbf 10 10000 0x3 0x3\n\
0 0 0 0 0 0 0\n\
0xdbf 1\n\
0 0\n\
0xc 2700\n\
0xc 2800\n\
0xc 1800\n\
0xc 0\n\
0x82 1000\n\
0x82 2800\n\
0x82 50\n\
0x82 0\n\
0x110 2000\n\
0x110 2700\n\
0x110 500\n\
0x110 0\n\
0xc00 2700\n\
0xc00 2800\n\
0xc00 50\n\
0xc00 0\n\
0x1 6000\n\
0x1 13000\n\
0x1 2700\n\
0x1 0\n\
0x20 13000\n\
0 0\n\
9990\n\
9990\n\
0\n\
0\n\
14 \n\
10 \n\
0x81010002\n\
0x81010002\n\
0x4402703b\n\
0x2703b\n\
0x0\n\
0x0\n",
    
}