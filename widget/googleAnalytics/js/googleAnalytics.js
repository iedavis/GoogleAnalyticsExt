/**
 * @fileoverview Google Analytics Widget.
 * Option.
 * @author ian.davis@oracle.com
 */

define(
  //-------------------------------------------------------------------
  // DEPENDENCIES
  //-------------------------------------------------------------------
  ['knockout', 'pubsub', 'ccConstants', 'ccLogger', '//www.google-analytics.com/analytics.js'],

  //-------------------------------------------------------------------
  // MODULE DEFINITION
  //-------------------------------------------------------------------
  function(ko, pubsub, CCConstants, ccLogger) {

    "use strict";

    var widget;

    return {

      onLoad: function(widgetModel) {
        widget = widgetModel;

        var GOOGLE_TRACK_ID;
        var GOOGLE_VERIFICATION_CODE = widget.googleVerificationCode();

        if(!widget.isPreview()){
          GOOGLE_TRACK_ID = widget.liveGoogleTrackingId();
          if(GOOGLE_VERIFICATION_CODE){
            $("head").append('<meta name="google-site-verification" content="' + GOOGLE_VERIFICATION_CODE + '"></meta>');
          }
        } else {
          GOOGLE_TRACK_ID = widget.testGoogleTrackingId();
        }

        if (ga !== undefined) {

//        NOTE: window.ga object is instantiated in analytics.js, loaded in dependencies
          window.ga('create', GOOGLE_TRACK_ID, 'auto');
          window.ga('require', 'ec', 'ec.js');

//        Subscribe to system events for tracking with Google Analytics
          $.Topic(pubsub.topicNames.PAGE_READY).subscribe(this.pageReady);
          $.Topic(pubsub.topicNames.RECORD_PAGINATION_PAGE_CHANGE).subscribe(this.recordPageHit);

          $.Topic(pubsub.topicNames.USER_CREATION_SUCCESSFUL).subscribe(this.profileRegistration);
          $.Topic(pubsub.topicNames.USER_PROFILE_PASSWORD_UPDATE_SUCCESSFUL).subscribe(this.profilePasswordUpdate);
          $.Topic(pubsub.topicNames.USER_RESET_PASSWORD_SUCCESS).subscribe(this.profilePasswordReset);


          $.Topic(pubsub.topicNames.ORDER_SUBMISSION_SUCCESS).subscribe(this.orderSuccessful);
          $.Topic(pubsub.topicNames.ORDER_CREATE).subscribe(this.orderCreated);


//   Not using Recs yet
//          $.Topic("RECOMMENDATIONS_CHANGED").subscribe(this.recommendationsOffered);


//   These two things aren't quite working yet. Event firing seems a bit odd
//   SKU_SELECTED event seems to be firing too many times
//          $.Topic(pubsub.topicNames.PRODUCT_VIEWED).subscribe(this.productViewed);
//          $.Topic(pubsub.topicNames.SKU_SELECTED).subscribe(this.productViewed);

        } else {
          ccLogger.error("Google Analytics JavaScript did not load/initialize");
        }
      },

      pageReady: function(page){
        widget.recordPageHit();
        if(page.parameters !== undefined){
          if(page.parameters.indexOf(CCConstants.SEARCH_TERM_KEY + '=') >= 0){
            var cleanSearchTerm = widget.getCleanSearchTerm(page.parameters);
            pageString = pageString.split('?')[0] + '?q=' + cleanSearchTerm;

            window.ga('send', {
              'hitType': 'event',
              'eventCategory': 'Search',
              'eventAction': 'Full String',
              'eventLabel': cleanSearchTerm
            });

            var hashes = cleanSearchTerm.split(' ');
            for(var i = 0; i < hashes.length; i++){
              window.ga('send', {
                'hitType': 'event',
                'eventCategory': 'Search',
                'eventAction': 'Word',
                'eventLabel': hashes[i]
              });
            }
          }
        }
      },

      recordPageHit: function(){
        var pageString = location.hash;
        if(pageString === '' || pageString === '/'){pageString = '/#!/home';}
        window.ga('send', {
          'hitType': 'pageview',
          'page': pageString,
          'title': document.title
        });
      },

      getCleanSearchTerm: function(pageParams){
        var hash, searchTermString;
        var hashes = pageParams.split('&');
        for(var i = 0; i < hashes.length; i++){
          hash = hashes[i].split('=');
          if(hash[0] === CCConstants.SEARCH_TERM_KEY){searchTermString = hash[1];}
        }
        searchTermString = decodeURIComponent(decodeURIComponent(searchTermString)).toLowerCase();
        searchTermString = searchTermString.split(CCConstants.SEARCH_PROPERTY_SEPARATOR)[1];
        searchTermString = searchTermString.substr(0,searchTermString.length - 1);
        return(searchTermString);
      },

      orderCreated: function(){
//      Grab the content of the Cart and store on widget.orderSnapshot before widget.cart() gets wiped
//      We will need it to send to Google once the ORDER_SUBMISSION_SUCCESS event fires to execute orderSuccessful().
        widget.orderSnapshot = {};
        widget.orderSnapshot.currencyCode = widget.cart().currencyCode();
        widget.orderSnapshot.totalPrice = widget.cart().total();
        widget.orderSnapshot.subtotal = widget.cart().subTotal();
        widget.orderSnapshot.tax = widget.cart().tax();
        widget.orderSnapshot.shipping = widget.cart().shipping();
        widget.orderSnapshot.items = [];
        for (var p = 0; p < widget.cart().items().length; p++) {
          widget.orderSnapshot.items[p] = {};
          widget.orderSnapshot.items[p].id = widget.cart().items()[p].productId;
          widget.orderSnapshot.items[p].sku_code = widget.cart().items()[p].productData().childSKUs[0].repositoryId;
          widget.orderSnapshot.items[p].name = widget.cart().items()[p].productData().displayName;
          widget.orderSnapshot.items[p].quantity = widget.cart().items()[p].quantity();
          widget.orderSnapshot.items[p].itemTotal = widget.cart().items()[p].itemTotal();
          widget.orderSnapshot.items[p].skuOptions = "";
          for (var o = 0; o < widget.cart().items()[p].selectedOptions.length; o++) {
            if(o > 0) widget.orderSnapshot.items[p].skuOptions = widget.orderSnapshot.items[p].skuOptions + ":";
            widget.orderSnapshot.items[p].skuOptions = widget.orderSnapshot.items[p].skuOptions + widget.cart().items()[p].selectedOptions[o].optionValue;
          }
        }
      },

      orderSuccessful: function(data){
//      Order and Payment has been successfully authorized, so time to send to send the Order to Google Analytics.
        var orderId = data[0].id;
        window.ga('set', '&cu', widget.orderSnapshot.currencyCode);
        for (var p = 0; p < widget.orderSnapshot.items.length; p++) {

          var productName = widget.orderSnapshot.items[p].name +
                            ' (' + widget.orderSnapshot.items[p].id + ')';
          var skuName = "";
          if(widget.orderSnapshot.items[p].skuOptions !== ""){
            skuName = widget.orderSnapshot.items[p].name +
                      ' - ' + widget.orderSnapshot.items[p].skuOptions +
                      ' (' + widget.orderSnapshot.items[p].sku_code + ')';
          } else {
            skuName = widget.orderSnapshot.items[p].name +
                      ' (' + widget.orderSnapshot.items[p].sku_code + ')';
          }

          window.ga('ec:addProduct', {
            'id': skuName,
            'name': productName,
            'category': '',
//            'brand': widget.orderSnapshot.items[p].brand,
            'variant': widget.orderSnapshot.items[p].skuOptions,
            'price': widget.orderSnapshot.items[p].itemTotal / widget.orderSnapshot.items[p].quantity,
            'quantity': widget.orderSnapshot.items[p].quantity
          });
        }
        window.ga('ec:setAction', 'purchase', {
          'id': orderId,
          'affiliation': widget.site().name,
          'revenue': widget.orderSnapshot.totalPrice,
          'tax': widget.orderSnapshot.tax,
          'shipping': widget.orderSnapshot.shipping,
          'coupon': ''
        });

//      See if this Order contains any 'recommended' products seen in this Session
//      Generate some Google Events to track conversions vs. recommendations
/**
        if(widget.recsOfferedThisSession){
          var recsConversionStatus = 'Order has no Recommended Products';
          var recsCounter = 0;
          for (p = 0; p < widget.orderSnapshot.items().length; p++){
            var recommendedThisSession = false;
            for (var i = 0; i < widget.recsOfferedThisSession.length; i++){
              if(widget.orderSnapshot.items[p].id.toUpperCase() === widget.recsOfferedThisSession[i]){
                recommendedThisSession = true;
                recsConversionStatus = 'Order has Recommended Products';
                recsCounter++;
              }
            }
            if(recommendedThisSession === true){
              window.ga('send', {
                'hitType': 'event',
                'eventCategory': 'Recommended Product Purchase',
                'eventAction': 'Product Purchase',
                'eventLabel': widget.orderSnapshot.items[p].name + ' (' + widget.orderSnapshot.items[p].id + ')'
              });
            }
          }
          window.ga('send', {
            'hitType': 'event',
            'eventCategory': 'Recommendations Conversion Impact',
            'eventAction': 'Order Submit',
            'eventLabel' : recsConversionStatus,
            'eventValue' : recsCounter
          });
        }
*/

        widget.orderSnapshot = {};
      },

// NOT CURRENTLY TRIGGERED
      recommendationsOffered: function(recsOffered){
//      Maintain an array of Product ID's of products that have been recommended during this session
//      We can then check this array when an Order is placed to see if the Order contains recommended products
        if(widget.recsOfferedThisSession === undefined){widget.recsOfferedThisSession = [];}
        var startingArrayLength = widget.recsOfferedThisSession.length;
        for (var p = 0; p < recsOffered.length; p++){
          var wasAlreadyRecommended = false;
          for (var i = 0; i < startingArrayLength; i++){
            if(widget.recsOfferedThisSession[i] === recsOffered[p].id){
              wasAlreadyRecommended = true;
              break;
            }
          }
          if(wasAlreadyRecommended === false){
            widget.recsOfferedThisSession.push(recsOffered[p].id);
          }
        }
      },

      profileRegistration: function(data){
//      Track registration events.
        window.ga('send', {
          'hitType': 'event',
          'eventCategory': 'Customer',
          'eventAction': 'Registration',
          'eventLabel': ''
        });
      },

      profilePasswordUpdate: function(data){
//      Track password update events.
        window.ga('send', {
          'hitType': 'event',
          'eventCategory': 'Customer',
          'eventAction': 'Password Update',
          'eventLabel': ''
        });
      },

      profilePasswordReset: function(data){
//      Track password reset events.
        window.ga('send', {
          'hitType': 'event',
          'eventCategory': 'Customer',
          'eventAction': 'Password Reset',
          'eventLabel': ''
        });
      },


// NOT CURRENTLY TRIGGERED
      productViewed: function(product, sku, variantOptions){
        var productName = product.displayName + ' (' + product.id + ')';
        var skuName = "";
        var skuOptions = "";
        var categoryName = "";
        if(sku){
          if(variantOptions){
            for (var o = 0; o < variantOptions.length; o++) {
              if(o > 0) skuOptions = skuOptions + ":";
              skuOptions = skuOptions + variantOptions[o].selectedOptionValue().key;
            }
            skuName = product.displayName + ' - ' + skuOptions + ' (' + sku.repositoryId + ')';
          } else {
            skuName = product.displayName + ' (' + sku.repositoryId + ')';
          }

        } else {
          if(product.childSKUs.length === 1){
            skuName = product.displayName + ' (' + product.childSKUs[0].repositoryId + ')';
          } else {
            skuName = product.displayName + ' (??)';
          }
        }

        categoryName = product.parentCategories[0].displayName;
        if(product.parentCategories[0].fixedParentCategories[0].displayName !== undefined){
          categoryName = product.parentCategories[0].fixedParentCategories[0].displayName + ' / ' + categoryName;
        }

        window.ga('ec:addProduct', {
          'id': skuName,
          'name': productName,
          'category': categoryName,
          'brand': '',
          'variant': ''
        });
        window.ga('ec:setAction', 'detail');
      }
    };
  }
);