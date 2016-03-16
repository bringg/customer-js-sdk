'use strict';

describe('BringgSDK', function () {

  it('check the API of the service', function () {
    expect(BringgSDK._socket).toBeNull();
    expect(BringgSDK.initializeBringg).toBeDefined();
    expect(BringgSDK.terminateBringg).toBeDefined();

    expect(BringgSDK.connect).toBeDefined();
    expect(BringgSDK.isConnected).toBeDefined();
    expect(BringgSDK.watchOrder).toBeDefined();

    expect(BringgSDK.setConfiguration).toBeDefined();
    expect(BringgSDK.setEventCallback).toBeDefined();
    expect(BringgSDK.submitRating).toBeDefined();
    expect(BringgSDK.submitRatingReason).toBeDefined();
    expect(BringgSDK.submitNote).toBeDefined();
    expect(BringgSDK.submitLocation).toBeDefined();
    expect(BringgSDK.submitTip).toBeDefined();

    expect(BringgSDK.getLastKnownETA).toBeDefined();
    expect(BringgSDK.getETAMethod).toBeDefined();
    expect(BringgSDK.setOrderUpdateCb).toBeDefined();
    expect(BringgSDK.setLocationUpdateCb).toBeDefined();
    expect(BringgSDK.setETAUpdateCb).toBeDefined();
    expect(BringgSDK.setETAMethodChangedCb).toBeDefined();
    expect(BringgSDK.setETAMethod).toBeDefined();
    expect(BringgSDK.setConnectionCallbacks).toBeDefined();
  });

  it ('check internal methods', function(){
    expect(BringgSDK._setETACalcInterval).toBeDefined();
    expect(BringgSDK._onETAIntervalSet).toBeDefined();
    expect(BringgSDK._setPollingInterval).toBeDefined();
    expect(BringgSDK._setCredentials).toBeDefined();
  });

  describe('sockets', function(){
    it('connect ', function () {
      spyOn(BringgSDK, '_connectSocket');
      spyOn(BringgSDK, 'setConnectionCallbacks');
      BringgSDK.connect();

      expect(BringgSDK._connectSocket).toHaveBeenCalled();
      expect(BringgSDK.setConnectionCallbacks).toHaveBeenCalled();
    });

    it('disconnect', function () {

      var socket = {
        removeAllListeners: function () {

        }, disconnect: function () {

        }, connected: true
      };

      spyOn(socket, 'removeAllListeners');
      spyOn(socket, 'disconnect');
      BringgSDK._socket = socket;

      BringgSDK.disconnect();

      expect(socket.removeAllListeners).toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalled();
      expect(BringgSDK._socket).toBeNull();
    });
  });

  describe('rating', function(){
    it('with invalid config', function(){
      var callback = jasmine.createSpy('callback');
      BringgSDK.setEventCallback({
        'taskRatedCb': callback
      });
      var configuration = null;
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({success: false, message: 'invalid configuration'});

      configuration = {};
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({success: false, message: 'no url or token provided for rating'});

      configuration = {rating_url: faker.internet.url()};
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({success: false, message: 'no url or token provided for rating'});

      configuration = {rating_token : faker.internet.password()};
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({success: false, message: 'no url or token provided for rating'});
    });

    it('error from server', function(){
      var callback = jasmine.createSpy('callback');
      BringgSDK.setEventCallback({
        'taskRatedCb': callback
      });

      window.$ = {post:function(){
        return {fail: function(){
          callback({success: false, message: 'Unknown error while rating'});
        }}
      }};

      var configuration = {rating_url: faker.internet.url(), rating_token : faker.internet.password()};
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({success: false, message: 'Unknown error while rating'});
    });

    it('success from server', function(){
      var response = {success : true};
      var callback = jasmine.createSpy('callback');
      BringgSDK.setEventCallback({
        'taskRatedCb': callback
      });

      window.$ = {post : function(url, params, successCallback){
        callback(response);
        return{fail : function(){}};
      }};

      var configuration = {rating_url: faker.internet.url(), rating_token : faker.internet.password()};
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({success: true});
    });
  });

  describe('eta', function(){
    it('eta calc interval should call set interval with the correct params', function(){
      spyOn(window,'setInterval');
      spyOn(window,'setTimeout');
      var interval = faker.random.number();
      BringgSDK._setETACalcInterval(interval);
      expect(window.setInterval).toHaveBeenCalledWith(BringgSDK._onETAIntervalSet, interval);
      expect(window.setTimeout).toHaveBeenCalledWith(BringgSDK._onETATimeoutSet, 3000);
    });

    it('onEtaIntervalSet should clear interval if not watching driver ', function(){
      BringgSDK._setWatchingDriver(false);
      spyOn(window,'clearInterval');
      BringgSDK._onETAIntervalSet();
      expect(window.clearInterval).toHaveBeenCalled();
    });
  });
});
