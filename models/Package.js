const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    services: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service'
    }],
    medicines: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicine'
    }],
    extraServices: [{
        name: String,
        price: Number
    }],
    totalPrice: {
        type: Number,
        default: 0
    },
    description: {
        type: String,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Package', packageSchema);
