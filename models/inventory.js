var f = require('util').format
  , ObjectID = require('mongodb').ObjectID;

// Store the db instance
var db = null;
var collectionName = 'inventories';

//
// Initialize the type
var init = function(_db) {
  if(_db) db = _db;
  
  var Inventory = function(product) {
    for(var name in product) {
      this[name] = product[name];
    } 
  }

  Inventory.create = function(fields, callback) {
    db.collection(collectionName).insert(fields, {w:1}, function(err, r) {
      if(err) return callback(err);
      callback(null, new Inventory(r[0]));
    });
  }

  Inventory.findByProductId = function(id, callback) {
    db.collection(collectionName).findOne({product_id: id}, function(err, r) {
      if(err) return callback(err);
      callback(null, new Inventory(r));
    });    
  }

  Inventory.init = function(callback) {
    // Ensure index on sales rank
    db.collection(collectionName).ensureIndex({product_id: 1}, {background:true}, function(err) {
      if(err) return callback(err);
      callback(null, null);
    });
  }

  Inventory.release = function(productId, cartId, callback) {
    // Ensure we have correct types
    productId = typeof productId == 'string' ? new ObjectID(productId) : productId;
    cartId = typeof cartId == 'string' ? new ObjectID(cartId) : cartId;
    
    // Fetch the inventory entry
    Inventory.findByProductId(productId, function(err, product) {
      if(err) return callback(err, null);

      var cart;
      // Locate the cart entry
      for(var i = 0; i < product.reserved.length; i++) {
        if(product.reserved[i].cart_id.equals(cartId)) {
          cart = product.reserved[i];
          break;
        }
      }

      // No cart found in list of reservations
      if(cart == null) return callback(new Error(f("no cart found for cart id %s")));

      // Let's return the reserved inventory from the cart
      db.collection(collectionName).update({
          product_id: productId
        , "reserved.cart_id": cart.cart_id
        , "reserved.quantity": cart.quantity
      }, {
          $inc: { available: cart.quantity }
        , $pull: { reserved: { cart_id: cart.cart_id }}
      }, function(err, r) {
        if(err) return callback(err);
        callback(null, null);
      });    
    });
  }

  Inventory.update = function(productId, cartId, quantity, delta, callback) {
    // Ensure we have correct types
    productId = typeof productId == 'string' ? new ObjectID(productId) : productId;
    cartId = typeof cartId == 'string' ? new ObjectID(cartId) : cartId;
    quantity = typeof quantity == 'string' ? parseInt(quantity, 10) : quantity;
    delta = typeof delta == 'string' ? parseInt(delta, 10) : delta;

    // Attempt to reserve the quantity
    db.collection(collectionName).update({
        product_id: productId
      , "reserved.cart_id": cartId
      , available: { $gte: delta }
    }, {
        $inc: { available: -delta }
      , $set: {
        "reserved.$.quantity": quantity + delta, modified_on: new Date()
      }
    }, function(err, n) {
      if(err) return callback(err);
      if(n == 0) 
        return callback(new Error(f("no inventory available for product %s", productId.toString())));
      // Success, items are reserved
      callback(null, null);
    });
  }

  Inventory.reserve = function(productId, cartId, quantity, callback) {
    productId = typeof productId == 'string' ? new ObjectID(productId) : productId;
    cartId = typeof cartId == 'string' ? new ObjectID(cartId) : cartId;
    quantity = typeof quantity == 'string' ? parseInt(quantity, 10) : quantity;

    // Attempt to reserve the quantity
    db.collection(collectionName).update({
        product_id: productId
      , available: { $gte: quantity }
    }, {
        $inc: { available: -quantity }
      , $push: {
        reserved: {
          quantity: quantity, cart_id: cartId, created_on: new Date()
        }
      }
    }, function(err, n) {
      if(err) return callback(err);
      if(n == 0) 
        return callback(new Error(f("no inventory available for product %s", productId.toString())));
      // Success, items are reserved
      callback(null, null);
    });
  }

  return Inventory;
}

module.exports = init;