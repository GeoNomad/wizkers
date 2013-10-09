/**
 * A FriedCirctuits OLED Backpack instrument
 */


var FCOledInstrument = function() {
    
    // This has to be a backbone view
    this.getSettings = function(arg) {
        return new FCOledSettings(arg);
    };
    
    // This has to be a Backbone view
    // This is the full screen live view (not a small widget)
    this.getLiveDisplay = function(arg) {
        return new FCOledLiveView(arg);
    };
    
        // This is a Backbone view
    // This is a numeric display
    this.getNumDisplay = function(arg) {
        return new FCOledNumView(arg);
    };
    
    // A diagnostics/device setup screen
    this.getDiagDisplay = function(arg) {
        return null;
        return new FCOledDiagView(arg);
    };

    
    // A smaller widget (just a graph)
    this.getLiveWidget = function(arg) {
        return new FCOledLiveWidget(arg);
    };
    
    // This has to be a link manager
    this.getLinkManager = function(arg) {
        return new FCOledLinkManager(arg);
    };
    
    
};