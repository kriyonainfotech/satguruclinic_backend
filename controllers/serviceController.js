const Service = require('../models/Service');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

exports.createService = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'services:service-add'))) return denied(res);
        const { name, price, discountPercent = 0, finalPrice, description } = req.body;
        const numPrice = Number(price) || 0;
        const disc = Math.max(0, Math.min(100, Number(discountPercent) || 0));
        const finalP = (finalPrice !== undefined && finalPrice !== null && finalPrice !== '')
            ? Number(finalPrice)
            : (disc > 0 ? Math.round(numPrice * (1 - disc / 100)) : numPrice);

        const newService = new Service({
            name,
            price: numPrice,
            discountPercent: disc,
            finalPrice: finalP,
            description
        });
        await newService.save();
        res.status(201).json(newService);
    } catch (error) {
        res.status(500).json({ message: 'Error creating service', error: error.message });
    }
};

exports.getServices = async (req, res) => {
    try {
        const services = await Service.find().sort({ createdAt: -1 });
        const mapped = services.map(s => {
            const doc = s.toObject();
            if (doc.discountPercent === undefined) doc.discountPercent = 0;
            if (doc.finalPrice === undefined) {
                doc.finalPrice = doc.discountPercent > 0
                    ? Math.round(doc.price * (1 - doc.discountPercent / 100))
                    : doc.price;
            }
            return doc;
        });
        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching services', error: error.message });
    }
};

exports.updateService = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'services:service-edit'))) return denied(res);
        const { id } = req.params;
        const { name, price, discountPercent, finalPrice, description } = req.body;
        
        let updateData = { ...req.body };
        if (price !== undefined || discountPercent !== undefined || finalPrice !== undefined) {
            const current = await Service.findById(id);
            const numPrice = price !== undefined ? Number(price) : (current ? current.price : 0);
            const disc = discountPercent !== undefined
                ? Math.max(0, Math.min(100, Number(discountPercent) || 0))
                : (current ? current.discountPercent || 0 : 0);
            
            let finalP;
            if (finalPrice !== undefined && finalPrice !== null && finalPrice !== '') {
                finalP = Number(finalPrice);
            } else if (disc > 0) {
                finalP = Math.round(numPrice * (1 - disc / 100));
            } else {
                finalP = numPrice;
            }

            updateData.price = numPrice;
            updateData.discountPercent = disc;
            updateData.finalPrice = finalP;
        }

        const updatedService = await Service.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        if (!updatedService) {
            return res.status(404).json({ message: 'Service not found' });
        }
        res.json(updatedService);
    } catch (error) {
        res.status(500).json({ message: 'Error updating service', error: error.message });
    }
};

exports.deleteService = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'services:service-delete'))) return denied(res);
        const { id } = req.params;
        const deletedService = await Service.findByIdAndDelete(id);
        if (!deletedService) {
            return res.status(404).json({ message: 'Service not found' });
        }
        res.json({ message: 'Service deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting service', error: error.message });
    }
};
