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
 * The main screen of our app.
 * 
 * Our model is the settings object.
 *
 * @author Edouard Lafargue, ed@lafargue.name
 */

define(function(require) {
    "use strict";
    
    var $       = require('jquery'),
        _       = require('underscore'),
        Backbone = require('backbone'),
        utils    = require('app/utils'),
        tpl     = require('text!tpl/instruments/FCOledNumView.html'),
        template = null;
                
        try {
            template =  _.template(tpl);
            console.log("Loaded direct template");
        } catch (e) {
            // Will happen if we are packaged in a Chrome app
            try {
                console.log("Trying compiled template");
                template = require('js/tpl/instruments/FCOledNumView.js');
            } catch (e) {
            console.log(e);
            }
        }
    
    return Backbone.View.extend({

        initialize:function (options) {
            this.settings = this.model;

            this.sessionStartStamp = new Date().getTime();
            this.maxreading = 0;
            this.minreading = -1;

            linkManager.on('input', this.showInput, this);

        },

        events: {
            "click #screen": "clickScreen",
            "click #refresh-btn": "clickRefresh",
            "click #raz": "clickRaz",
            "click #alarm-btn": "clickAlarm",
        },

        clickScreen: function(event) {
            var screen = event.target.innerHTML;
            if (screen != undefined) {
                linkManager.driver.screen(screen);
            }
        },

        clickRefresh: function(event) {
            var rate = $("#refresh",this.el).val();
            if (rate < 150) {
                rate = 150;
                $("#refresh",this.el).val(150)
            }
            linkManager.driver.rate(rate);
        },

        clickAlarm: function(event) {
            var rate = $("#alarm",this.el).val();
            if (alarm > 2000) {
                rate = 2000;
                $("#alarm",this.el).val(2000)
            }
            linkManager.driver.alarm(rate);
        },


        clickRaz: function() {
            linkManager.driver.reset();
        },

        render:function () {
            var self = this;
            console.log('Main render of FC Oled Backpack numeric view');
            $(this.el).html(template());
            return this;
        },

        onClose: function() {
            console.log("FC Oled Backpack numeric view closing...");
            linkManager.off('input', this.showInput,this);
        },

        showInput: function(data) {
            if (typeof(data.v) == 'undefined')
                return;
            var v = parseFloat(data.v.avg);
            var a = parseFloat(data.a.avg);
            $('#livev', this.el).html(v.toFixed(3) + "&nbsp;V");
            $('#livea', this.el).html(a.toFixed(3) + "&nbsp;mA");
            $('#mwh',this.el).html(data.mwh);
            $('#mah',this.el).html(data.mah);

            // Update statistics:
            var sessionDuration = (new Date().getTime() - this.sessionStartStamp)/1000;
            $('#sessionlength',this.el).html(utils.hms(sessionDuration));

        },


    });
});