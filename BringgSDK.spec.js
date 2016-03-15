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
});
