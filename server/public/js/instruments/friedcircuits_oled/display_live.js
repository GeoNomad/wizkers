// Live view for the Fried Circuits OLED backpack
// 
// Our model is the settings object.

window.FCOledLiveView = Backbone.View.extend({

    initialize:function (options) {
        
        this.currentDevice = null;
        
        this.deviceinitdone = false;
        
        this.livepoints = 300; // 5 minutes @ 1 Hz
        this.livevolt = [];
        this.liveamp = [];
        
        this.sessionStartStamp = new Date().getTime();
        this.maxreading = 0;
        this.minreading = -1;

        
        // TODO: save color palette in settings ?
        // My own nice color palette:
        this.palette = ["#e27c48", "#5a3037", "#f1ca4f", "#acbe80", "#77b1a7", "#858485", "#d9c7ad" ],

        
        this.plotOptions = {
            xaxes: [{ mode: "time", show:true, timezone: settings.get("timezone") },
                   ],
            yaxes: [ {}, {position:"right", min:0} ],
            grid: {
				hoverable: true,
				clickable: true
			},
            legend: { position: "ne" },
            colors: this.palette,
        };        
        
        this.prevStamp = 0;

        linkManager.on('status', this.updatestatus, this);
        linkManager.on('input', this.showInput, this);
        
    },
    
    
    events: {

    },
    
    render:function () {
        var self = this;
        console.log('Main render of OLED Backpack live view');
        $(this.el).html(this.template());
        linkManager.requestStatus();
            
        this.color = 1;

        this.addPlot();

        return this;
    },
    
    addPlot: function() {
        var self=this;
        // Now initialize the plot area:
        console.log('Plot chart size: ' + this.$('.datachart').width());
        this.plot = $.plot($(".datachart", this.el), [ {data:[], label:"V", color:this.color},
                                                       {data:[], label:"mA"}
                                                     ], this.plotOptions);
    },
    
    onClose: function() {
        console.log("OLED Backpack view closing...");
        
        linkManager.off('status', this.updatestatus,this);
        linkManager.off('input', this.showInput,this);
        
        // Stop the live stream before leaving
        linkManager.stopLiveStream();

    },

        
    updatestatus: function(data) {
        console.log("OLED live display: serial status update");
    },

    
    // We get there whenever we receive something from the serial port
    showInput: function(data) {
        var self = this;
                
        if (data.v != undefined && data.a != undefined) {
            var v = parseFloat(data.v);
            var a = parseFloat(data.a);
            if (this.livevolt.length >= this.livepoints)
                this.livevolt = this.livevolt.slice(1);
            if (this.liveamp.length >= this.livepoints)
                this.liveamp = this.liveamp.slice(1);
            this.livevolt.push([new Date().getTime(), v]);
            this.liveamp.push([new Date().getTime(), a]);
            this.plot.setData([ { data:this.livevolt, label: "V", color: this.color },
                               { data:this.liveamp, label: "mA", yaxis: 2 },
                                ]);
            this.plot.setupGrid(); // Time plots require this.
            this.plot.draw();
            }

        
    },

});