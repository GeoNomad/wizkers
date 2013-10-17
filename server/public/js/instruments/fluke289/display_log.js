// Log view for the Fluke 289.
// 
// Our model is a collection of Logs
//
// Eventually, will manage (dispatch?) all sort of log types:
//
//   - Live recording
//   - Trendview logs
//   - Min-Max logs
//   - Peak logs
//
// Current status: - Live recording display

window.Fluke289LogView = Backbone.View.extend({

    initialize:function () {
        var self = this;

        this.deviceLogs = this.collection;
        
        this.packedData = null;
        this.selectedData = null;
        
        // Need this to make sure "render" will always be bound to our context.
        // -> required for the _.after below.
        _.bindAll(this,"render");
        
        // Now fetch all the contents, then render
        var renderGraph = _.after(this.deviceLogs.length, this.render);
        this.deviceLogs.each(function(log) {
            log.entries.fetch({success: renderGraph});
        });

            
        // TODO: save color palette in settings ?
        // My own nice color palette:
        this.palette = ["#e27c48", "#5a3037", "#f1ca4f", "#acbe80", "#77b1a7", "#858485", "#d9c7ad" ],

            
        this.plotOptions = {
            xaxis: { mode: "time", show:true,
                    timezone: settings.get("timezone"),                  
                   },
            grid: {
				hoverable: true,
				clickable: true
			},
            legend: { position: "ne" },
            selection: {
				mode: "xy"
			},
            
            colors: this.palette,
        };        
        
        this.overviewOptions = {
			legend: { show: false },
			xaxis: { mode: "time", show:false, ticks:4 },
			yaxis: { ticks:4 },
			selection: { mode: "xy" },
            colors: this.palette,
		};  
        
    },
    
    events: {
        "click .resetZoom": "resetZoom",
        "click #cpmscale": "cpmScaleToggle",
        "change #linestoggle input": "refreshGraphs",
    },
    
    refreshGraphs: function(event) {
        var boxes = $('#linestoggle ul').find("li")
        for (var i=0; i< boxes.length; i++) {
            this.packedData[i].vizapp_show = $(boxes[i]).find("input").is(':checked');
        }
        this.selectedData = this.selectData();

        this.addPlot();
    },
        
    resetZoom: function() {
        delete this.ranges;
        this.addPlot();
        return false;
    },

    cpmScaleToggle: function(event) {
        var change = {};
        if (event.target.checked) {
            change["cpmscale"]="log";
        } else {
            change["cpmscale"]="linear";
        }
        settings.set(change);
        this.render();
        this.addPlot();
        
    },

    
    render:function () {
        var self = this;
        console.log('Main render of Log management view');

        $(this.el).html(this.template());
        
        // Pack our data
        if (this.packedData == null || this.packedData.length == 0)
            this.packedData = this.packData();
        
        this.selectedData = this.selectData();
        if (this.selectedData.length == 0)
            return;

        if (settings.get("cpmscale") == "log")
            $("#cpmscale",this.el).attr("checked",true);
        if (settings.get('cpmscale')=="log") {
            this.plotOptions.yaxis = {
                        min:1,
                        //ticks: [1,10,30,50,100,500,1000,1500],
                        transform: function (v) { return Math.log(v+10); },
                        inverseTransform: function (v) { return Math.exp(v)-10;}
                    };
            this.overviewOptions.yaxis = this.plotOptions.yaxis;
        } else if ('yaxis' in this.plotOptions){
            delete this.plotOptions.yaxis.min;
            delete this.plotOptions.yaxis.transform;
            delete this.plotOptions.yaxis.inverseTransform;
        }
        
        if (this.deviceLogs == null || this.deviceLogs.length == 0)
            return;

            
        this.addPlot();

        return this;
    },
    
    onClose: function() {
        console.log("Log management view closing...");
        
        // Restore the settings since we don't want them to be saved when changed from
        // the home screen
        settings.fetch();
    },
        
    // Generate a "blob:"  URL to download (all) the data;
    saveDataUrl: function() {
        return;
        var json = "";
        for (var i=0; i < this.onyxlog.length; i++) {
            json += "{timestamp:" + this.onyxlog.at(i).get('timestamp') +
                    ",cpm:" + this.onyxlog.at(i).get('cpm') + "},";
        }

        var jsonBlob = new Blob([json], {type: 'application/json'});
        var url = window.URL.createObjectURL(jsonBlob);
        $('.ctrl-save', this.el).attr('href', url);
    },
    
    
    // We can only add the plot once the view has finished rendering and its el is
    // attached to the DOM, so this function has to be called from the home view.
    addPlot: function() {
        var self=this;
                
        // TODO: only valid for 1st log, not the whole set
        $('#log_size',this.el).html(this.deviceLogs.getOverallLength());
        $('#log_start',this.el).html(new Date(this.deviceLogs.getLogsStart()).toString());
        $('#log_end',this.el).html(new Date(this.deviceLogs.getLogsEnd()).toString());

        
        // Now initialize the plot area:
        
        
        // Restore current zoom level if it exists:
        if (this.ranges) {
            this.plot = $.plot($(".locochart",this.el), this.selectedData,
                $.extend(true, {}, this.plotOptions, {
                    xaxis: { min: this.ranges.xaxis.from, max: this.ranges.xaxis.to },
                    yaxis: { min: this.ranges.yaxis.from, max: this.ranges.yaxis.to }
                })
             );

        } else {
            this.plot = $.plot($(".locochart", this.el), this.selectedData, this.plotOptions);
        };
            
        $(".locochart", this.el).bind("plothover", function (event, pos, item) {
            if (item) {
                if (previousPoint != item.dataIndex) {
                    previousPoint = item.dataIndex;

                    $("#tooltip").remove();
                    var x = item.datapoint[0],
                    y = item.datapoint[1];

                    self.showTooltip(item.pageX, item.pageY,
                        "<small>" + ((settings.get('timezone') === 'UTC') ? 
                                        new Date(x).toUTCString() :
                                        new Date(x).toString()) + "</small><br>" + item.series.label + ": <strong>" + y + "</strong>");
                }
            } else {
                $("#tooltip").remove();
                previousPoint = null;            
            }
        });

        // Create the overview chart:
        this.overview = $.plot($("#overview",this.el), this.selectedData, this.overviewOptions);
        
        // Connect overview and main charts
        $(".locochart",this.el).bind("plotselected", function (event, ranges) {

            // clamp the zooming to prevent eternal zoom

            if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
                ranges.xaxis.to = ranges.xaxis.from + 0.00001;
            }

            if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
                ranges.yaxis.to = ranges.yaxis.from + 0.00001;
            }
            
            // Save the current range so that switching plot scale (log/linear)
            // can preserve the zoom level:
            self.ranges = ranges;

            // do the zooming
            this.plot = $.plot($(".locochart",this.el), self.selectedData,
                $.extend(true, {}, self.plotOptions, {
                    xaxis: { min: ranges.xaxis.from, max: ranges.xaxis.to },
                    yaxis: { min: ranges.yaxis.from, max: ranges.yaxis.to }
                })
             );

            // don't fire event on the overview to prevent eternal loop
            self.overview.setSelection(ranges, true);
        });

        $("#overview",this.el).bind("plotselected", function (event, ranges) {
             self.plot.setSelection(ranges);
          });
        
        // Last, update the save data URL to point to the data we just displayed:
        this.saveDataUrl();

    },

    
    // TODO: depending on log type, we need to pack our data differently...
    packData: function() {
        
        // Create a table of Y values with the x values from our collection
        var data = []; // data is an array of arrays
        var dataunits = []; // dataunits is sync'ed with data, and returns the unit string of the data
        var tzOffset = new Date().getTimezoneOffset()*60000;

        var logs = this.deviceLogs;
        // At this stage we know the logs are already fetched, btw
        for (var j=0; j<logs.length; j++) {
            var entries = logs.at(j).entries;
            for (var i=0; i < entries.length; i++) {
                // On the Fluke, we get a timestap from the device itself, this is the one we use.
                // The trick here is that we never know what sort of data we're gonna get in the log,
                // as there can be many readings in each entry...
                var entry = entries.at(i);
                if (entry.get('data').reading != undefined) {
                    // Go through every reading contained here:
                    var readings = entry.get('data').reading.readings;
                    for (var k=0; k < readings.length; k++) {
                        var reading = readings[k];
                        if (reading.readingState == "NORMAL") {
                            // Get the unit of this reading: if we already have it in the data
                            // table, then append it. Otherwise we have to add a new entry in our
                            // data table:
                            var unit = linkManager.driver.mapUnit(reading.baseUnit) + " - " + reading.readingID;
                            var idx = dataunits.indexOf(unit);
                            
                            // Now find out whether the user wants us to plot this:
                            var unitnosp = reading.baseUnit + reading.readingID.replace(/\s/g,'_');
                            var toggle = $('#linestoggle ul',this.el).find('.' + unitnosp);
                            if (toggle.length == 0) {
                                    // This is a new unit, we gotta add this to the toggle list
                                    $('#linestoggle ul').append('<li class="'+unitnosp+'"><input type="checkbox" checked>&nbsp'+unit+'</li>');
                            }
                            if (idx > -1) {
                                // If the reading's timestamp is zero, then we gotta use the timestamp
                                // of the log entry instead
                                data[idx].push([(reading.timeStamp == 0) ?
                                                entry.get('timestamp')-tzOffset : reading.timeStamp,reading.readingValue]);
                            } else {
                                // This is a new unit, create another entry:
                                dataunits.push(unit);
                                data.push([
                                    [(reading.timeStamp == 0) ?
                                                entry.get('timestamp')-tzOffset : reading.timeStamp,reading.readingValue]
                                ]);
                            }                            
                        }
                    }
                }
            }
        }
       // We now have a big data array that contains all our readings, we gotta
       // repack it into a list of data/units for the plot:
       var plotData = [];
       for (var i=0; i < data.length; i++) {
            plotData.push({ data: data[i], label: linkManager.driver.mapUnit(dataunits[i]), vizapp_show: true});
        }
        return plotData;
    },
    
    // Return only data that we want to display
    selectData: function() {
        var dataSelected = [];
        for (var i=0; i< this.packedData.length; i++) {
            if (this.packedData[i].vizapp_show)
                dataSelected.push(this.packedData[i]);
        }
        return dataSelected;
    },
    
    // Ugly at this stage, just to make it work (from flotcharts.org examples)
    showTooltip: function (x, y, contents) {
			$("<div id='tooltip' class='well'>" + contents + "</div>").css({
				position: "absolute",
				display: "none",
				top: y + 5,
				left: x + 5,
                padding: "3px",
				opacity: 0.90
			}).appendTo("body").fadeIn(200);
    },
    
});