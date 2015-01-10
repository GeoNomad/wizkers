/** (c) 2015 Edouard Lafargue, ed@lafargue.name
 *
 * This file is part of Wizkers.
 *
 * Wizkers is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Wizkers is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Wizkers.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 *  Connection to devices connected through the Helium network
 *
 * Opens at create, sends 'data' events,
 * and 'status' events.
 *
 * Supports a "write" method.
 *
 * We do MSGPack conversions in here too, so that higher level
 * objects don't need to deal with anything else than Javascript.
 *
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 *
 */

var helium = require('helium'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    debug = require('debug')('wizkers:connections:helium');

var msgpack = require('msgpack5')() // namespace our extensions
  , encode  = msgpack.encode
  , decode  = msgpack.decode;

var Debug = false;

//////////////////
// Helium network interface:
//////////////////

// path is a helium JSON object with:
//  {mac: "HEX STRING", token: "base64 token" }
var HeliumConnection = function(path) {
    
    EventEmitter.call(this);
    var portOpen = false;
    var self = this;
    
    var token = path.token;
    var mac = path.mac;

    debug("Creating Helium object with the following info:");
    debug(path);
    var myHelium = new helium.Helium();
    
    this.open = function() {
        myHelium.open();

        debug("Starting subscription");
        myHelium.subscribe(mac, token);

        portOpen = true;
        debug('Port open');
        this.emit('status', {portopen: portOpen});

    };
    
    this.write = function(data) {
    }
    
    this.close = function(mac) {
        myHelium.unsubscribe(mac);
        myHelium.close();
        portOpen = false;
        self.emit('status', {portopen: portOpen});
    }
        

    // listen for new serial data:
   myHelium.on('message', function (data) {
        debug(data);
       var d2 = { mac: data.mac,
                 message: decode(data.message) }
        self.emit('data',d2);
   });
    
    return this;
}

util.inherits(HeliumConnection, EventEmitter);

module.exports = HeliumConnection;

