/*
 * Parser for the Fluke 289 multimeter
 *
 * This parser implements the Fluke binary link layer protocol
 * and is pretty robust. You send it data coming from the serial port
 * by calling "format" and you send it commands to send to the serial port
 * by calling "output".
 *
 * This driver is partially asynchronous, and it takes care or sending
 * results on the socket after parsing incoming data. Results are output
 * in json format.
 *
 * Due to the nature of the Fluke protocol, a lot of commands have to be
 * explicitly defined and handled within the driver.
 * 
 *
 */
var serialport = require('serialport'),
    SerialPort  = serialport.SerialPort,
    crcCalc = require('../crc-calc.js'),
    zlib = require('zlib');

Hexdump = require('../hexdump.js');
Bitmap = require('./lib/bitmap.js');
fs = require('fs');


module.exports = {

    // We have a lot of internal variables to manage
    // the link protocol:
    
    // TODO: is there a better way to manage states than
    //       those ugly objects ?

    // Session layer. Whenever a command is sent, the DMM
    // replies first with a response code ('ACK' below) then
    // the actual response if needed.
    state: { idle: 0,            // session is idle
             wait_ack: 1,        // command send, expecting ACK code
             wait_response: 2,   // ACK received, waiting for command response
             error: 3
           },
    
    // Low level parsing of incoming binary data
    protostate: { stx:0,         // Looking for 'STX' sequence
                  etx: 1,        // Looking for 'ETX' sequence
                },
    
    // Link layer protocol: state of the link layer
    linkstate: {  closed:0,       // Link closed
                  wantconnect: 1, // Link open request is sent by computer
                  open: 2         // Link open
               },
    
    // We keep track of the last sent command for which we are
    // expecting a response, to enable parsing of the response:
    pendingCommand : "",
    pendingCommandArgument: "",
    noReplyCommands: [ "LEDT", "PRESS", "MPQ", "SAVNAME", "MP" ], // Some commands don't send a reply except the ACK code

    // We manage a command queue on the link, as well as a
    // command timeout:
    commandQueue: [],
    timeoutTimer: null,

    // See 'state' above. This is session level
    currentState: 0,

    // Pointer to the serial port & socket, since we need to handle it directly for
    // some protocol link layer operations and command queue management
    port: null,
    socket: null,
    uidrequested: false,
    
    // Link state handling
    currentLinkstate: 0,     // see linkstate above
    currentStatusByte: 0x00, // TODO: fully clarify how this one works...
    
    // Binary buffer handling:
    currentProtoState: 0,          // see protostate above
    inputBuffer: new Buffer(2048), // meter never sends more than 1024 bytes anyway
    ibIdx:0,
    
    // Special handling of the bitmap download case: we get the whole
    // bitmap in several calls, so the variable below stores the parts
    tmpBitmap: [],
    tmpBitmapIndex: 0,
    
    // Set a reference to the serial port, used for the command
    // queue.
    setPortRef: function(s) {
        console.log("Setting port reference: " + s);
        this.port = s;
    },

    setSocketRef: function(s) {
        console.log("Setting socket reference: " + s);
        this.socket = s;
        
        // The port & socket at set at startup, so we also
        // reset the state of our driver here:
        this.resetState();
    },
    
    resetState: function() {
        this.currentLinkstate = 0;
        this.currentStatusByte = 0x00;
        this.currentProtoState = 0;
        this.ibIdx = 0;
        this.tmpBitmapIndex = 0;
        this.commandQueue = [];
        this.currentState = 0;
        this.pendingCommand = "";
    },
    
    sendData: function(data) {
        if (data)
            this.socket.emit('serialEvent',data);
    },
    
    // How the device is connected on the serial port            
    portSettings: {
            baudRate: 115200,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            flowControl: false,
            parser: serialport.parsers.raw,
    },
    
    // Returns starting index of 0x10 0x02
     sync: function(buffer, maxIndex) {
        for (var i= 0; i < maxIndex-1; i++) {
            if (buffer[i] == 0x10 && buffer[i+1] == 0x10)
                i += 2;
            if (buffer[i] == 0x10 && buffer[i+1] == 0x02) {
                return i;
            }
        }
        return -1;
    },

    etx: function(buffer, maxIndex) {
        for (var i= 0; i < maxIndex-3; i++) {
            if (buffer[i] == 0x10 && buffer[i+1] == 0x10)
                i += 2;
            if (buffer[i] == 0x10 && buffer[i+1] == 0x03) {
                return i+4; // Include CRC
            }
        }
        return -1;
    },
    
    // Unescapes character 0x10:
    unescape: function(buffer) {
        var readIdx = 0;
        var writeIdx = 0;
        var tmpBuffer = new Buffer(buffer.length);
        while (readIdx < buffer.length) {
            tmpBuffer[writeIdx] = buffer[readIdx];
            if (buffer[readIdx] == 0x10)
                readIdx++;
            writeIdx++;
            readIdx++;
        }
        // Now generate a recut buffer of the right size:
        var retBuffer = new Buffer(writeIdx);
        tmpBuffer.copy(retBuffer,0,0,writeIdx);
        return retBuffer;
    },
    
    debug: function(data) {
        
        console.log(data);
    },
    

    // Called when the HTML app needs a unique identifier.
    // this is a standardized call across all drivers.
    // For the Fluke, the UID is the serial number, so this is
    // what we will request, but we will return it inside a special
    // message.
    sendUniqueID: function() {
        this.debug("Fluke289: Asking for serial number for UID request");
        this.uidrequested = true;
        // TODO: handle port write within this.output
        this.port.write(this.output("QSN"));
    },
    
    
    // Link layer protocol management: receives raw data from
    // the serial port, saves it and as soon as a complete data packet
    // is received, forward it to the upper layer.
    //
    // data is a buffer
    format: function(data) {
        if (data) { // we sometimes get called without data, to further process the
                    // existing buffer
            // First of all, append the incoming data to our input buffer:
            this.debug("LLP: Received new serial data, appended at index " + this.ibIdx);
            data.copy(this.inputBuffer,this.ibIdx);
            this.ibIdx += data.length;
        }
        var start=-1, stop=-1;
        if (this.currentProtoState == this.protostate.stx) {
            start = this.sync(this.inputBuffer, this.ibIdx);      
            this.debug("Found STX: " + start);
            if (start > -1) {
                this.currentProtoState = this.protostate.etx;
                // Realign our buffer (we can copy over overlapping regions):
                this.inputBuffer.copy(this.inputBuffer,0,start);
                this.ibIdx -= start;
            } else {
                return;
            }
        }
        if (this.currentProtoState == this.protostate.etx) {
            stop = this.etx(this.inputBuffer, this.ibIdx);
            this.debug("Found ETX: " + stop);
            this.currentProtoState = this.protostate.stx;
        }
        if (stop == -1) {
            // We are receiving a packet but have not reached the end yet
            return;
        }
        // We have reached the end of the packet: copy the packet to a new buffer
        // for processing, and realign the input buffer:
        var controlByte = this.inputBuffer[2];
        this.debug("Control byte: " + controlByte.toString(16));
        
        // Check for control byte value:
        // I was not able to fully understand the logic of this byte...
        switch(controlByte) {
            case 0x05: // CRC Error
                this.debug("LLP: CRC Error on packet coming from computer");
                break;
            case 0x07: // Response to link open request
                this.debug("LLP: Link open");
                this.currentLinkstate = this.linkstate.open;
                break;
            case 0x0b: // Error (?)
                this.debug("LLP: Link closed - error (resetting LLP)");
                this.resetState(); // Reset our state, we have lost our sync...
                this.currentLinkstate = this.linkstate.closed;
                break;
            case 0x01: // Command reception acknowledge
            case 0x41:
                this.debug("LLP: Command ACK received");
                break;
            case 0x20: // Need to send an Acknowledge
                // Send packet with 0x21
                // - just send the prepackaged data...
                this.debug("LLP: Sending ACK");
                this.port.write(Buffer("10022110032138","hex"));
                this.currentStatusByte = 0x40;
                break;
            case 0x60:
                // Send packet with 0x61
                // - just send the prepackaged data...
                this.debug("LLP: Sending ACK");
                this.port.write(Buffer("1002611003573e","hex"));
                this.currentStatusByte = 0x00;
                break;
        }

        var response = '';
        // Placeholder: process the packet if it contains a payload
        if (stop > 7) {
            var escapedPacket = new Buffer(stop-7);
            this.inputBuffer.copy(escapedPacket,0,3,stop-4);
            // One last thing before the packet is ready: 0x10 is escaped,
            // so we need to replace any instance of 0x10 0x10 in the buffer
            // by a single 0x10
            var packet = this.unescape(escapedPacket);
            this.debug("LLP: New packet ready:");
            this.debug(packet);
            response = this.processPacket(packet);
        }

        this.inputBuffer.copy(this.inputBuffer,0,stop);
        this.ibIdx -= stop;
        
        if (this.ibIdx > stop) {
            this.sendData(response);
            this.format(); // We still have data to process, so we call ourselves recursively
            return;
        }
        
        this.sendData(response);
    },
        
    // processPacket is called by format once a packet is received, for actual
    // processing and sending over the socket.io pipe
    processPacket: function(buffer) {    
        this.debug('Fluke 289 - Packet received - execting it to be a response to ' + this.pendingCommand);
        if (this.timeoutTimer) { // Disarm watchdog
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        
        // We process in two stages:
        // 1. Check the response code
        // 2. Parse the response data
        //  Response data parsing is split in two:
        //    2.1 If expected response is binary, parse it
        //    2.2 If expected response is ASCII, parse it        
        var response = {};
        if (this.currentState == this.state.wait_ack) {            
            // Get the response code from the buffer: in case the response
            // is binary, data[1] as a string is not what we want, but we'll
            // address this in time
            var data = buffer.toString().split('\x0d');
            switch (data[0]) {
                case "0": // OK
                    // Some commands don't return anything else than an ACK, identify them here
                    // for performance reasons (skips all the processing below...)
                    if (this.noReplyCommands.indexOf(this.pendingCommand) != -1) {
                        this.currentState = this.state.idle;
                    } else {
                        this.currentState = this.state.wait_response;
                    }
                    break;
                    case "1": // Syntax Error
                        this.currentState = this.state.error;
                        break;
                    case "2": // Execution Error
                        this.currentState = this.state.error;
                        break;
                    case "5": // No data available
                        this.currentState = this.state.idle;
                        break;
                    default:
                        this.currentState = this.state.error;
                        break;
            }
            if (this.currentState == this.state.error) {
                this.currentState = this.state.idle;
                response = { "error":true };
            } else {
                response = { "error": false};
            }
        }
        
        if (this.currentState == this.state.wait_response) {
            var commandProcessed = false;
            //////////////////
            // First, process binary replies
            //////////////////
            switch(this.pendingCommand) {
                    case "QLCDBM":
                        commandProcessed = true;
                        // The meter only returns data in chunks of 1024 bytes
                        // so we need to request two QLCDBM commands to get
                        // everything
                            this.debug("Processing screenshot part 1");
                            this.tmpBitmap.push(buffer);
                            // Find start of data (after #0)
                            var idx = 0;
                            while(idx < buffer.length) {
                                if (buffer[idx]==0x23 && buffer[idx+1] == 0x30)
                                    break;
                                idx++;
                            }
                            this.tmpBitmapIndex += buffer.length-(idx+2);
                            this.debug("Received " + buffer.length + " bytes of Bitmap data");
                            // if we got a full buffer (1024 bytes), then we are not at the end
                            // of our bitmap
                            if (buffer.length == 1024) {
                                this.debug("Requesting more bitmap data");
                                // Bitmap processing is asynchronous...
                                this.commandQueue.push("QLCDBM " + this.tmpBitmapIndex);
                            } else {
                                // Got less than a full buffer, this means we have the
                                // complete bitmap:
                                this.processBitmap();
                                this.debug("Bitmap processing requested");
                            }
                        break;
                    default:
                        commandProcessed = false;
                        break;
            }

            //////////////////
            // Then process ASCII replies
            //////////////////
            if (!commandProcessed && ! (data[1] == undefined)) {
                // Below are ASCII replies, so it's time to
                // do the split on CSV fields:
                var fields = data[1].split(',');
                switch (this.pendingCommand) {                
                        case "ID": // Short Identification of meter
                            response.model = fields[0];
                            response.version = fields[1];
                            response.serial = fields[2];
                            break;
                        case "IM": // Long identification of meter
                            response.model   = fields[0];
                            response.version = fields[1];
                            response.serial  = fields[2]
                            response.mspversion = fields[3];
                            response.buildbranch = fields[4];
                            response.buildrevision = fields[5];
                            response.boardid = fields[6];
                            break;
                        case "QM": // Query Measurement: READING_VALUE, UNIT, STATE, ATTRIBUTE 
                            response.value = Number(fields[0]);
                            response.unit = fields[1];
                            response.state = fields[2];
                            response.attribute = fields[3];
                            break;
                        case "QCCV": // Calibration counter
                            response.calcounter = data[1];
                            break;
                        case "QCVN": // Calibration version
                            response.calversion = data[1];
                            break;
                        case "QBL": // Query battery life
                            response.battery = data[1];
                            break;
                        case "QMPQ": // Query Meter asset properties
                            // Remove single quotes:
                            data[1] = data[1].replace(/'/g,'');
                            switch(this.pendingCommandArgument) {
                                    case 'operator':
                                        response.operator = data[1];
                                        break;
                                    case 'company':
                                        response.company = data[1];
                                        break;
                                    case 'site':
                                        response.site = data[1];
                                        break;
                                    case 'contact':
                                        response.contact = data[1];
                                        break;
                            }
                            break;
                        case "QMEMLEVEL":
                            response.memlevel = data[1];
                            break;
                        case "QSN":
                            response.serial = data[1];
                            if (this.uidrequested) {
                                console.log("Sending uniqueID message");
                                this.socket.emit('uniqueID','' + data[1]);
                                this.uidrequested = false;
                            }
                            break;
                        case "QSAVNAME":
                            response.savname = { id: this.pendingCommandArgument, value:data[1] };
                            break;
                        case "QSLS": // TODO: confirm this ?
                            response.savedlogs = {
                                record: fields[0],  // This is a log session
                                minmax: fields[1],
                                peak: fields[2],
                                measurement: fields[3]
                            };
                            break;
                        default:
                            // We don't know what we received, just
                            // pass it on:
                            response.raw = data[1];
                            break;
                }
            }
            if (data[1] == undefined) {
                    console.log("WARNING: no return value for " + this.pendingCommand + ", you should add it to the noReplyCommands list");
            }
            this.currentState = this.state.idle;     
        }
        
        // If we have more commands in the queue, now is the time to process them
        if (this.commandQueue.length && this.currentState == this.state.idle) {
            var cmd = this.commandQueue.pop();
            this.debug("Command queue: dequeuing command " + cmd );
            this.port.write(this.output(cmd));
        }
        this.debug("Sending response ");
        this.debug(response);
        // TODO: move sending on socket in here
        return response;
    },
    
    waitTimeout: function(self) {
        self.debug("Timeout waiting for command response");
        self.sendData({error:true});
        self.currentState = self.state.idle;
        // We timed out waiting for a command, process the next one in the queue if there is one
        if (self.commandQueue.length) {
            var cmd = self.commandQueue.pop();
            self.debug("Command queue: dequeuing command " + cmd );
            self.port.write(self.output(cmd, self));
        }
        
    },
    
    // output should return a string, and is used to format
    // the data that is sent on the serial port, coming from the
    // HTML interface.
    output: function(data, context) {
        var self = this;
        if (context != undefined)
            self = context;
        
        // before being able to send commands, we need to ask to open
        // the link by sending status byte 0x03:
        if (this.currentLinkstate == this.linkstate.closed) {
            this.currentLinkstate = this.linkstate.wantconnect;
            var buf = new Buffer("1002031003a28e","hex");
            self.commandQueue.push(data);
            this.debug("Link closed: requested link open, queued command (" + data + ")");
            return buf;
        }
        if (this.currentLinkstate == this.linkstate.wantconnect) {
            this.debug("Waiting for link to open, queue command");
            self.commandQueue.push(data);
            return '';
        }

        if (self.currentState == null)
            self.currentState = self.state.idle;
        
        if (self.currentState != self.state.idle) {
            // We are working on a command, so queue this one
            self.commandQueue.push(data);
            this.debug("Waiting for command response, queuing command - " + data);
            return "";
        }
        // We need to save the previous command name because the meter does
        // not echo the command we send
        self.pendingCommand = data.split(" ")[0];
        self.pendingCommandArgument = data.split(" ")[1];
        this.debug("Sending command " + data );
        self.currentState = self.state.wait_ack;
        // We'll wait for 300ms for a response, otherwise we reset.
        self.timeoutTimer = setTimeout(self.waitTimeout, 300, self);


        //var tmp = new Buffer("1002407172736920341003","hex");
        var cmdToBuffer = new Buffer(data,'ascii'); // Turn our command to a buffer
        var tmp = new Buffer(cmdToBuffer.length+5);
        tmp.writeUInt16BE(0x1002,0);
        tmp.writeUInt8(this.currentStatusByte,2);
        cmdToBuffer.copy(tmp,3);
        tmp.writeUInt16BE(0x1003,tmp.length-2);
        
        //tmp = new Buffer("1002031003","hex");
        var crc = crcCalc.fluke_crc(tmp);
        //console.log('crc: ' + crc.toString(16));
        var finalBuffer = new Buffer(tmp.length+2);
        tmp.copy(finalBuffer,0);
        finalBuffer.writeUInt16LE(crc,finalBuffer.length-2);
        this.debug(finalBuffer);
        
        return finalBuffer;

    },

    // We now have a gzipped BMP contained in those two buffers
    // we need to decompress it, turn it into a structure that is intelligible
    // to a browser.
    processBitmap: function() {
        var self = this;
        var bmBuffers = [];
        // First of all, we need to remove the remaining framing:
        for (var i=0; i < this.tmpBitmap.length; i++) {
            // Find start of data (after #0)
            var idx = 0;
            while(idx < this.tmpBitmap[i].length) {
                if (this.tmpBitmap[i][idx]== 0x23 && this.tmpBitmap[i][idx+1] == 0x30)
                    break;
                idx++;
            }        
            var bmBuffer = new Buffer(this.tmpBitmap[i].length-(idx+2));
            this.tmpBitmap[i].copy(bmBuffer,0,idx+2);
            bmBuffers.push(bmBuffer);
            //this.debug("GZipped data buffer length is " + bmBuffer.length);
            //this.debug(Hexdump.dump(bmBuffer2.toString("binary")));
        }

        // Flush our temp buffer
        this.tmpBitmap = [];
        this.tmpBitmapIndex = 0;
        
        // Now assemble buffers & dezip:
        var bmBuffer = Buffer.concat(bmBuffers);
        this.debug("Compressed bitmap data is " + bmBuffer.length + " bytes long.");
        //this.debug(Hexdump.dump(bmBuffer.toString("binary")));
        
        zlib.unzip(bmBuffer, function(err, buffer) {
            if (!err) {
                // Also copy the result to a temporary file:
                var stream = fs.createWriteStream('screenshot.bmp');
                stream.write(buffer);
                stream.end();
                self.debug("Decompress successful, bitmap data length is " + buffer.length);
                try {
                    // Package the BMP bitmap into an RGBA image to send
                    // to a canvas element:
                    var bm = new Bitmap(buffer);
                    bm.init();
                    var data = bm.getData();
                    self.debug("Sending bitmap to application");
                    self.debug(data);
                    self.sendData({screenshot: data, width:bm.getWidth(), height: bm.getHeight()});
                } catch (err) {
                    self.debug("Something went wrong during bitmap decoding, data was probably corrupted ?\n" +err);
                }
            }           
        });
    },
                   
    
}