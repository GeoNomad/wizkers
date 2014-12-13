/**
 * The module that manages recording the output of an instrument to the
 * database
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */

"use strict"

var dbs = require('../pouch-config'),
    _ = require("underscore")._,
    debug = require('debug')('wizkers:output');


var Safecast = require('./safecast.js');
var Rest     = require('./rest.js');

/////////////////
// Private variales
/////////////////

var drivers = {};
var activeOutputs = {};
var availableOutputs = { "safecast": Safecast, "rest": Rest};

////////////////
// Private methods
////////////////

// Returns 'true' if alarm is triggered
var check_alarm = function(output, alarm, data) {
    if (alarm.field != "_unused" && alarm.field != "") {
        var field = output.plugin.resolveMapping(alarm.field, data);
        if (field != undefined) {
            // If both field and alarm.level can be parsed as
            // numbers, do it:
            var numval = parseFloat(field);
            if (!isNaN(numval))
                field = numval;
            numval = parseFloat(alarm.level);
            if (!isNaN(numval))
                alarm.level = numval;
            
            switch (alarm.comparator) {
                case "less":
                    return (field < alarm.level);
                    break;
                case "moreeq":
                    return (field >= alarm.level);
                    break;
                case "eq":
                    return (field == alarm.level);
                    break;
                default:
                    return false;
            }
        }
    }
    return false;
}

// Main feature of our manager: send the data
// to all active output plugins according to their
// schedule.
var output = function(data,insid) {
    if (!activeOutputs.hasOwnProperty(insid)) {
        debug("*** ERROR: asked to output data to output plugins that are not registered");
        return;
    }
    var active = activeOutputs[insid];
    for (var idx in active) {
        var output = active[idx];
        if (alarm(output,data) || regular(output) ) {
            debug("Output triggered with this data " + data);
            output.plugin.sendData(data);
            output.last = new Date().getTime();
        }
    }
};


// Do we have an alarm on this output ?
var alarm = function(output, data) {
    var alarm1 = output.config.alarm1,
        alarm2 = output.config.alarm2,
        alrmbool = output.config.alrmbool,
        alarm = false;
        
    var alarm1_triggered = check_alarm(output, alarm1, data);
    var alarm2_triggered = check_alarm(output, alarm2, data);

    switch (alrmbool) {
        case 'and':
            alarm = (alarm1_triggered && alarm2_triggered);
            break;
        case 'or':
            alarm = (alarm1_triggered || alarm2_triggered);
            break;
        default:
            break;
    }
    if (!alarm)
        return false;

    var freq = output.config.alrmfrequency;
    if (freq = 0)
        return false;
    if ( (output.last_alarm == undefined) ||
         (new Date().getTime() - output.last_alarm > freq*1000)
       ) {
            output.last_alarm = new Date().getTime();
            return true;
    }

    return false;
};
    
var regular = function(output) {
    var freq = output.config.frequency;
    if (freq == 0)
        return false;
    if ((new Date().getTime() - output.last) > freq*1000)
        return true;
    return false;        
}



/**
 * Register a new instrument driver.
 */
var register = function(driver, cb) {
    var instrumentid = driver.getInstrumentId();
    if (drivers.hasOwnProperty(instrumentid)) {
            debug('WARNING, this driver is already registered, this should not happen');
    } else {
        drivers[instrumentid] = { driver:driver, cb:cb };
    }
}


////////////////
// Private public
////////////////


module.exports = {
    
    
    // Selects the active output plugins. Note that we only require
    // the instrument ID, since it stores its own list of enabled outputs,
    // and more importantly, all the settings for those.
    enableOutputs: function(insid, driver) {
        debug('Retrieving Outputs for Instrument ID: ' + insid);
        
        // Destroy the previous list of active outputs,
        activeOutputs[insid] = [];
        if (drivers.hasOwnProperty(insid)) {
            // and also reset the driver callbacks for the
            // previous set of outputs
            debug("Unregistering previous driver data callback");
            var driver = drivers[insid].driver;
            driver.removeListener('data', drivers[insid].cb);
        }
        
        // TODO: user persistent queries before going to prod
        dbs.outputs.query(function(doc) {
                            if (doc.enabled == true)
                                emit(doc.instrumentid);
                    },
                          {key: insid, include_docs: true},
                          function(err,outputs) {
                                if (err && err.status == 404) {
                                    debug("No enabled outputs");
                                    return;
                                }
            var gotOutputs = false;
            _.each(outputs.rows, function(out) {
                // Now we need to configure the output and put it into our activeOutputs list
                var pluginType = availableOutputs[out.doc.type];
                if (pluginType == undefined) {
                    debug("***** WARNING ***** we were asked to enable an output plugin that is not supported but this server");
                } else {
                    var plugin = new pluginType();
                    // The plugin needs its metadata and the mapping for the data,
                    // the output manager will take care of the alarms/regular output
                    plugin.setup(out.doc);
                    activeOutputs[insid].push( { "plugin": plugin, "config": out.doc, last: new Date().getTime() } );
                    gotOutputs = true;
                }
            });
            if (gotOutputs) {
                debug("Adding a callback for driver data");
                // Now, register a callback on data events coming from the driver to
                // trigger outputs:
                var cb = function(data) {
                        output(data,insid);
                        };
                register(driver,cb); // Keep track for later use when we stop recording
                driver.on('data', cb);
            }

        });
    },
    
    disconnectOutputs: function(insid) {
        if (! drivers.hasOwnProperty(insid)) {
            // We were asked to disconnect outputs that were not connected
            return;
        }
        var driver = drivers[insid].driver;
        driver.removeListener('data', drivers[insid].cb);
        delete drivers[insid];
        //
        // we don't really need to delete the list, because it gets
        // overwritten at connection
        /*
        if (! activeOutputs.hasOwnProperty(insid)) {
            // We were asked to disconnect outputs that were not connected
            // or there were just no outputs connected on that instrument.
            debug("WARNING: did not find outputs for that instrument but was still asked to disconnect them, FIXME");
            return;
        }
        */
    }
        
};
    


