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

  it('rate with invalid config', function(){
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
    expect(callback).toHaveBeenCalledWith({success: false, message: 'no url provided for rating'});
  });

  it('rate error from server', function(){
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

  it('rate success from server', function(){
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
