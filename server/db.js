/**
 * Where we are storing our database configuration and schemas.
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


var mongoose = require( 'mongoose' );
var Schema   = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');


/**
 * Our data schema for the application is defined here
 */

/**
 * Describes an instrument. The "metadata" field enables storage of generic key/values
 */
var InstrumentSchema = new Schema({
    
        name: String,           // Used for display
        type: String,           // Will correspond to parsers known on the server side
        tag: String,            // Asset tag for the instrument (if supported)
        uuid: String,           // Serial number or unique ID (if supported)
        port: String,           // Name of the port on server side
        comment: String,        // Simple comments
        icon: String,           // TbD: either user-selectable, or served by server-side (linked to type)
        liveviewspan: String,                 // Width of live view in seconds
        liveviewperiod: String,                 // Period of polling if supported
        liveviewlogscale: Boolean,                // Should live view display as a log scale by default ?
        metadata: Schema.Types.Mixed, // Depending on instrument type, this metadata can include additional settings
});
 
// Compile the schema by issuing the below:
mongoose.model('Instrument', InstrumentSchema );

/**
 *  Describes an output plugin. Again, the metadata object is where interesting
 *  things happen.
 */
var OutputSchema = new Schema({
    
        instrumentid: {type: Schema.Types.ObjectId, ref:'Instrument', default:null},
        name: String,           // Used for display
        type: String,
        comment: String,        // Simple comments
        enabled: Boolean,
        mappings: Schema.Types.Mixed, // Data fields we want to send
        metadata: Schema.Types.Mixed, // Depending on output type, this metadata can include additional settings
        wantsalldata: Boolean,
        alarm1: { field: String, comparator: String, level: String },
        alarm2: { field: String, comparator: String, level: String },
        alrmbool: String,
        frequency: Number,
        alrmfrequency: Number,
        lastsuccess: Date,  // When data was last successfully sent
        last: Date,         // When was the last attempt (successful or not) to upload
        lastmessage: String // What was the result of that last attempt
});
 
// Compile the schema by issuing the below:
mongoose.model('Output', OutputSchema );



/**
 * Settings: global application settings.
 *
 * For now: ID of the current layout, and current loco
 */
var ApplicationSettingsSchema = new Schema({
    serialPort: String,
    timezone: String,
    cpmcolor: Number,
    cpmscale: String,
    itemsperpage: Number,
    currentInstrument: {type: Schema.Types.ObjectId, ref:'Instrument', default:null},
    currentUserRole: { type:String, default: "pending"},
    token: String, // The current authorization token for socket.io
    showstream: Boolean, // Show debug output
});

mongoose.model('Settings',ApplicationSettingsSchema);



/**
 *  Device logs
 *  Device logs manage generic log entries (using 'data' which can be anything)
 *
 * logsessionid is indexed for performance, otherwise the app takes forever to return
 * logs on small devices like the Beaglebone Black
 */
var DeviceLogEntrySchema = new Schema({
    logsessionid: {type: Schema.Types.ObjectId, ref:'LogSession', default:null, index: true}, // Should match the ID of a log session model (see below)
    timestamp: Date,    // Javascript timestamp for that entry (milliseconds since 1970)
    comment: String,     // We will one day support commenting any data point in a log...
    data: Schema.Types.Mixed       // Will be an object that depends on the device type
});
mongoose.model('DeviceLogEntry', DeviceLogEntrySchema);

var LogSession = new Schema({
       instrumentid: {type: Schema.Types.ObjectId, ref:'Instrument', default:null},
                            // Device model
       logtype: String,     // To be used by the device driver, in case the device supports different
                            // kinds of logs.
       guid: String,        // Device UUID for this log session
       swversion: String,   // Keep track of firmware version for the log session (traceability)
       name: String,        // Let user name logging session if necessary
       description: String, // Likewise, let user describe the session there too.
       startstamp: Date,    // Start of the log. Should be the same as the date of the earliest point in the log
       endstamp : Date,     // End of the log. Should be the same as the date of the last point in the log
       datapoints: Number,  // Should be the count of log entries referencing this log.
       metadata: Schema.Types.Mixed, // Can be anything, used to store log metadata if relevant to the plugin
});
mongoose.model('LogSession', LogSession);


/**
 * Role management: we are defining simple roles, and users will only have
 * one role at a time - no complex overlapping rights/roles/etc
 *
 *  - pending: can only see their login page. An admin will have to upgrade to another role.
 *  - viewer: a read-only role (cannot connect/disconnect to a device, ony home screen + log access)
 *  - operator: a read-write role for all instruments on the instance
 *  - admin : same as operator + change roles for users
 */


/**
 * User management (local only for now)
 */
var UserSchema = new Schema({
    local: {
        email: {type: String, index: true },
        password: String
    },
    google           : {
        id           : String,
        token        : String,
        email        : String,
        name         : String
    },
    facebook         : {
        id           : String,
        token        : String,
        email        : String,
        name         : String
    },

    role: { type:String, default: "pending"}  // Should be "pending", "viewer", "operator" or "admin"
});

// methods ======================
// generating a hash (see http://scotch.io/tutorials/javascript/easy-node-authentication-setup-and-local)
UserSchema.methods.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

// checking if password is valid
UserSchema.methods.validPassword = function(password) {
    return bcrypt.compareSync(password, this.local.password);
};

mongoose.model('User', UserSchema);


var uri = 'mongodb://localhost/vizappdb';
var connectDB = function() {
    mongoose.connect(uri, function (err) {
        // if we failed to connect, retry
        if (err) {
            console.log("Database not ready");
            setTimeout(connectDB, 500);
        } else {
            ready = true;
        }
    })
};



connectDB();
