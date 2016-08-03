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

  describe('watch', function(){
    describe('order', function(){
      describe('module callback', function(){
        it('should use callback on no response', function(){
          var callback = jasmine.createSpy('callback');
          BringgSDK._watchOrderCb(undefined, callback);
          expect(callback).toHaveBeenCalledWith({success: false, rc: BringgSDK.RETURN_CODES.no_response, error: 'watch order failed - no response'});
        });

        it('should use callback on failure', function(){
          var callback = jasmine.createSpy('callback');
          BringgSDK._watchOrderCb({}, callback);
          expect(callback).toHaveBeenCalledWith({success: false, rc: BringgSDK.RETURN_CODES.unknown_reason, error: 'watch order failed - unknown reason'});
        });

        it('should use callback on expired', function(){
          var callback = jasmine.createSpy('callback');
          BringgSDK._watchOrderCb({expired: true}, callback);
          expect(callback).toHaveBeenCalledWith({success: false, rc: BringgSDK.RETURN_CODES.expired, error: 'expired'});
        });

        describe('on success', function(){
          it('should use callback', function(){
            var callback = jasmine.createSpy('callback');
            var result = {success: true};
            BringgSDK._watchOrderCb(result, callback);
            expect(callback).toHaveBeenCalledWith(result);
          });

          it('should mark as watching order', function(){
            BringgSDK._setWatchingOrder(false);

            BringgSDK._watchOrderCb({success: true});
            expect(BringgSDK.isWatchingOrder()).toBeTruthy();
          });
        });
      });
    });

    describe('driver', function(){
      describe('module callback', function(){
        it('should use callback on failure', function(){
          var callback = jasmine.createSpy('callback');
          BringgSDK._watchDriverCb({}, callback);
          expect(callback).toHaveBeenCalledWith({success: false, rc: BringgSDK.RETURN_CODES.unknown_reason, error: 'failed watching driver'});

          BringgSDK._watchDriverCb(undefined, callback);
          expect(callback).toHaveBeenCalledWith({success: false, rc: BringgSDK.RETURN_CODES.no_response, error: 'failed watching driver'});
        });

        it('should use callback on success', function(){
          var callback = jasmine.createSpy('callback');
          var result = {success: true};
          BringgSDK._watchDriverCb(result, callback);
          expect(callback).toHaveBeenCalledWith(result);
        });

        it('should set eta calculation interval on success', function(){
          spyOn(BringgSDK, '_setETACalcInterval');
          BringgSDK._watchDriverCb({success: true});
          expect(BringgSDK._setETACalcInterval).toHaveBeenCalled();
        });
      });
    });

    describe('waypoint', function(){
      it('should use callback on failure', function(){
        var callback = jasmine.createSpy('callback');
        BringgSDK._watchWayPointCb({}, callback);
        expect(callback).toHaveBeenCalledWith({success: false, rc: BringgSDK.RETURN_CODES.unknown_reason, error: 'failed watching waypoint'});

        BringgSDK._watchWayPointCb(undefined, callback);
        expect(callback).toHaveBeenCalledWith({success: false, rc: BringgSDK.RETURN_CODES.no_response, error: 'failed watching waypoint'});
      });

      it('should use callback on success', function(){
        var callback = jasmine.createSpy('callback');
        var result = {success: true};
        BringgSDK._watchWayPointCb(result, callback);
        expect(callback).toHaveBeenCalledWith(result);
      });
    });
  });

  describe('set watching', function(){
    it('should mark driver watched accordingly', function(){
      BringgSDK._setWatchingDriver(false);
      expect(BringgSDK.isWatchingDriver()).toBeFalsy();
      BringgSDK._setWatchingDriver(true);
      expect(BringgSDK.isWatchingDriver()).toBeTruthy();
      BringgSDK._setWatchingDriver(false);
      expect(BringgSDK.isWatchingDriver()).toBeFalsy();
    });

    it('should mark order watched accordingly', function(){
      BringgSDK._setWatchingOrder(false);
      expect(BringgSDK.isWatchingOrder()).toBeFalsy();
      BringgSDK._setWatchingOrder(true);
      expect(BringgSDK.isWatchingOrder()).toBeTruthy();
      BringgSDK._setWatchingOrder(false);
      expect(BringgSDK.isWatchingOrder()).toBeFalsy();
    });
  });

  describe('on new configuration', function(){
    it('should set eta calc interval if already watching driver', function(){
      spyOn(BringgSDK, '_setETACalcInterval');
      spyOn(BringgSDK, '_setDriverActivity');
      BringgSDK._setWatchingDriver(true);
      BringgSDK._onNewConfiguration({});
      expect(BringgSDK._setETACalcInterval).toHaveBeenCalled();
    });

    it('should not set eta calc interval if not watching driver', function(){
      spyOn(BringgSDK, '_setETACalcInterval');
      spyOn(BringgSDK, '_setDriverActivity');
      BringgSDK._setWatchingDriver(false);
      BringgSDK._onNewConfiguration({});
      expect(BringgSDK._setETACalcInterval).not.toHaveBeenCalled();
    });

    it('should call disconnect if shared location is expired', function(){
      spyOn(BringgSDK, 'disconnect');
      BringgSDK._onNewConfiguration({expired: true});
      expect(BringgSDK.disconnect).toHaveBeenCalled();
    });

    it('should not call disconnect if shared location is valid', function(){
      spyOn(BringgSDK, 'disconnect');
      spyOn(BringgSDK, '_setDriverActivity');
      BringgSDK._onNewConfiguration({});
      expect(BringgSDK.disconnect).not.toHaveBeenCalled();
    });
  });
});
