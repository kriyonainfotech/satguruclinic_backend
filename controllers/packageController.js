const Package = require('../models/Package');
const Service = require('../models/Service');
const Medicine = require('../models/Medicine');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

exports.createPackage = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'services:package-add'))) return denied(res);
        const { name, services, medicines, extraServices = [], description, discountPercent = 0, customPrice } = req.body;
        
        let originalPrice = 0;
        if (services && services.length > 0) {
            const selectedServices = await Service.find({ _id: { $in: services } });
            originalPrice += selectedServices.reduce((sum, service) => sum + (service.finalPrice !== undefined ? service.finalPrice : service.price), 0);
        }
        
        if (medicines && medicines.length > 0) {
            const selectedMedicines = await Medicine.find({ _id: { $in: medicines } });
            medicines.forEach(mId => {
                const med = selectedMedicines.find(m => m._id.toString() === mId.toString());
                if (med) originalPrice += (med.price || 0);
            });
        }
        
        if (extraServices.length > 0) {
            originalPrice += extraServices.reduce((sum, es) => sum + Number(es.price || 0), 0);
        }

        const disc = Math.max(0, Math.min(100, Number(discountPercent) || 0));
        let totalPrice;
        if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
            totalPrice = Number(customPrice);
        } else if (disc > 0) {
            totalPrice = Math.round(originalPrice * (1 - disc / 100));
        } else {
            totalPrice = originalPrice;
        }

        const newPackage = new Package({ 
            name, 
            services, 
            medicines,
            extraServices,
            description,
            originalPrice,
            discountPercent: disc,
            totalPrice 
        });
        await newPackage.save();
        
        const populatedPackage = await Package.findById(newPackage._id).populate('services').populate('medicines');
        res.status(201).json(populatedPackage);
    } catch (error) {
        res.status(500).json({ message: 'Error creating package', error: error.message });
    }
};

exports.getPackages = async (req, res) => {
    try {
        const packages = await Package.find()
            .populate('services')
            .populate('medicines')
            .sort({ createdAt: -1 });
        const mapped = packages.map(p => {
            const doc = p.toObject();
            if (doc.discountPercent === undefined) doc.discountPercent = 0;
            if (!doc.originalPrice || doc.originalPrice === 0) {
                let sum = 0;
                if (doc.services) {
                    sum += doc.services.reduce((acc, s) => acc + (s.finalPrice ?? s.price ?? 0), 0);
                }
                if (doc.medicines) {
                    sum += doc.medicines.reduce((acc, m) => acc + (m.price ?? 0), 0);
                }
                if (doc.extraServices) {
                    sum += doc.extraServices.reduce((acc, es) => acc + (Number(es.price) || 0), 0);
                }
                doc.originalPrice = sum > 0 ? sum : doc.totalPrice;
            }
            return doc;
        });
        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching packages', error: error.message });
    }
};

exports.updatePackage = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'services:package-edit'))) return denied(res);
        const { id } = req.params;
        const { name, services, medicines, extraServices, description, discountPercent, customPrice } = req.body;
        
        let updateData = { name, description };
        const currentPackage = await Package.findById(id);
        if (!currentPackage) {
            return res.status(404).json({ message: 'Package not found' });
        }

        const finalServices = services !== undefined ? services : currentPackage.services;
        const finalMedicines = medicines !== undefined ? medicines : currentPackage.medicines;
        const finalExtraServices = extraServices !== undefined ? extraServices : currentPackage.extraServices;
        
        let originalPrice = 0;
        if (finalServices && finalServices.length > 0) {
            const selectedServices = await Service.find({ _id: { $in: finalServices } });
            originalPrice += selectedServices.reduce((sum, service) => sum + (service.finalPrice !== undefined ? service.finalPrice : service.price), 0);
        }
        if (finalMedicines && finalMedicines.length > 0) {
            const selectedMedicines = await Medicine.find({ _id: { $in: finalMedicines } });
            finalMedicines.forEach(mId => {
                const med = selectedMedicines.find(m => m._id.toString() === mId.toString());
                if (med) originalPrice += (med.price || 0);
            });
        }
        if (finalExtraServices && finalExtraServices.length > 0) {
            originalPrice += finalExtraServices.reduce((sum, es) => sum + Number(es.price || 0), 0);
        }

        const disc = discountPercent !== undefined
            ? Math.max(0, Math.min(100, Number(discountPercent) || 0))
            : (currentPackage.discountPercent || 0);

        let totalPrice;
        if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
            totalPrice = Number(customPrice);
        } else if (disc > 0) {
            totalPrice = Math.round(originalPrice * (1 - disc / 100));
        } else {
            totalPrice = originalPrice;
        }

        updateData.originalPrice = originalPrice;
        updateData.discountPercent = disc;
        updateData.totalPrice = totalPrice;
        if (services !== undefined) updateData.services = services;
        if (medicines !== undefined) updateData.medicines = medicines;
        if (extraServices !== undefined) updateData.extraServices = extraServices;

        const updatedPackage = await Package.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('services').populate('medicines');
        
        res.json(updatedPackage);
    } catch (error) {
        res.status(500).json({ message: 'Error updating package', error: error.message });
    }
};

exports.deletePackage = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'services:package-delete'))) return denied(res);
        const { id } = req.params;
        const deletedPackage = await Package.findByIdAndDelete(id);
        if (!deletedPackage) {
            return res.status(404).json({ message: 'Package not found' });
        }
        res.json({ message: 'Package deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting package', error: error.message });
    }
};
