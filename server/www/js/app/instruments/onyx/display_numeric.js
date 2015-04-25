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

/*
 * Display output of Geiger counter in numeric format
 * 
 * @author Edouard Lafargue, ed@lafargue.name
 */

define(function(require) {
    "use strict";
    
    var $       = require('jquery'),
        _       = require('underscore'),
        Backbone = require('backbone'),
        utils    = require('app/utils'),
        template = require('js/tpl/instruments/OnyxNumView.js');


    return Backbone.View.extend({

        initialize:function (options) {
            this.sessionStartStamp = new Date().getTime();
            this.maxreading = 0;
            this.minreading = -1;
            this.valid = false;
            this.validinit = false;
            linkManager.on('input', this.showInput, this);
        },

        events: {
        },

        render:function () {
            var self = this;
            console.log('Main render of Onyx numeric view');
            $(this.el).html(template());
            return this;
        },

        onClose: function() {
            console.log("Onyx numeric view closing...");
            linkManager.off('input', this.showInput, this);
        },

        showInput: function(data) {
            
            if (typeof(data.devicetag) != 'undefined')
                $('#devicetag',this.el).html(data.devicetag);

            if (typeof(data.cpm) == 'undefined')
                return;
            var cpm = parseFloat(data.cpm.value);
            var usv = parseFloat(data.cpm.usv);
            $('#livecpm', this.el).html(cpm.toFixed(0));
            if (usv) {
                $('#liveusvh', this.el).html(usv.toFixed(3) + "&nbsp;&mu;Sv/h");
            }
            
            if (data.cpm.valid)
                 $('#readingvalid', this.el).removeClass('label-danger').addClass('label-success').html('VALID');
            else
                $('#readingvalid', this.el).removeClass('label-success').addClass('label-danger').html('INVALID');

            // Update statistics:
            var sessionDuration = (new Date().getTime() - this.sessionStartStamp)/1000;
            $('#sessionlength',this.el).html(utils.hms(sessionDuration));

            if (cpm > this.maxreading) {
                this.maxreading = cpm;
                $('#maxreading', this.el).html(cpm);
            }
            if (cpm < this.minreading || this.minreading == -1) {
                this.minreading = cpm;
                $('#minreading', this.el).html(cpm);
            }

        },


    });
});