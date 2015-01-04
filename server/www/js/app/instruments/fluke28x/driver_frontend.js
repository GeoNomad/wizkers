/**
 * (c) 2015 Edouard Lafargue, ed@lafargue.name
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
 * The controller communication driver:
 *
 *  - provides API to the backend device to use by views
 *
 * @author Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */

define(function(require) {
    "use strict";

    // linkManager is a reference to the parent link manager
    return function() {

        var self = this;
        var lm = linkManager;
        this.battCheck = 0;
        this.ledState = "OFF";


        //////
        //  Standard API:
        // All link managers need this function:
        //////
        this.getBackendDriverName = function() {
            return 'fluke28x';
        }

        //////
        // End of standard API
        //////

        // All commands below are fully free and depend on
        // the instrument's capabilities


        // Query meter for software version & serial number
        this.version = function() {
            lm.sendCommand('IM');
            lm.sendCommand('QCCV');
            lm.sendCommand('QCVN');
        }

        // Queries the primary measurement only. Adds battery check
        // every 10 queries as a bonus.
        this.queryMeasurement = function() {
            self.battCheck = (self.battCheck+1)%10;
            if (self.battCheck == 0)
                lm.sendCommand('QBL');

            lm.sendCommand('QM');
        }

        // Extended version, queries all currently displayed
        // measurements on the meter.
        this.queryMeasurementFull = function() {
            self.battCheck = (self.battCheck+1)%10;
            if (self.battCheck == 0)
                lm.sendCommand('QBL');

            lm.sendCommand('QDDA');
        }

        this.getDevInfo = function() {
            var callQueue = [ 'QMPQ operator', 'QMPQ company', 'QMPQ site', 'QMPQ contact' ];
            var idx = 0;
            // Be nice to the device and stage the queries (our driver manages a command queue, so it
            // is not strictly necessary but hey, let's be cool).
            var caller = function() {
                lm.sendCommand(callQueue[idx++]);
                if (idx < callQueue.length)
                    setTimeout(caller,50);
            }
            caller();    
        }

        this.setDevInfo = function(operator, company, site, contact) {
            // Remove double quotes
            operator = operator.replace(/"/g,'');
            company = company.replace(/"/g,'');
            site = site.replace(/"/g,'');
            contact = contact.replace(/"/g,'');
            if (operator != '')
                lm.sendCommand('MPQ operator,"' + operator + '"');
            if (company != '')
                lm.sendCommand('MPQ company,"' + company + '"');
            if (site != '')
                lm.sendCommand('MPQ site,"' + site + '"');
            if (contact != '')
                lm.sendCommand('MPQ contact,"' + contact + '"');
        };

        this.takeScreenshot = function() {
            lm.sendCommand('QLCDBM 0');
        }

        this.toggleLed = function() {
            (self.ledState == "OFF") ? self.ledState="ON":self.ledState="OFF";
            lm.sendCommand('LEDT ' + self.ledState);
            if (self.ledState == "ON")
                return true;
            return false;
        }

        this.off = function() {
            lm.sendCommand('OFF');
        }                                        

        this.sendKeypress = function(key) {
            lm.sendCommand('PRESS ' + key);
        }


        // Sends several queries related to memory level.
        // Note: will fail if the meter is recording something.
        this.getMemInfo = function() {
            lm.sendCommand('QMEMLEVEL');
            lm.sendCommand('QSLS');
        }

        this.getTrendlogRecord = function(address,index) {
            lm.sendCommand( 'QSRR ' + address + ',' + index);
        }

        // Helper methods to format output:
        this.units = {
            "CEL": "°C",
            "VDC": "V dc",
            "ADC": "A dc",
            "VAC": "V ac",
            "AAC": "A ac",
            "VAC_PLUS_DC": "V <small>AC+DC</small>",
            // "VAC_PLUS_DC": "V <small>AC+DC</small>",
            "OHM": "&#8486;",
            "SIE": "Sie",
            "HZ": "Hz",
            "FAR": "°F",
            "F": "F",
            "PCT": "%",
        };
        
        this.multipliers = ['M', 'k', '', 'm', '&mu;', 'n', 'p'];

        this.mapUnit = function(unit, mult) {
            var res = this.units[unit];
            if (res == undefined)
                    return unit;
            var prefix = this.multipliers[-mult/3+2];
            return prefix + res ;
        }
        console.log('Started Fluke289 link manager driver..');

    }

});

