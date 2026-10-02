const Package = require('../models/Package');
const Service = require('../models/Service');
const Medicine = require('../models/Medicine');

exports.createPackage = async (req, res) => {
    try {
        const { name, services, medicines, extraServices = [], description } = req.body;
        
        let totalPrice = 0;
        if (services && services.length > 0) {
            const selectedServices = await Service.find({ _id: { $in: services } });
            totalPrice += selectedServices.reduce((sum, service) => sum + service.price, 0);
        }
        
        if (medicines && medicines.length > 0) {
            const selectedMedicines = await Medicine.find({ _id: { $in: medicines } });
            totalPrice += selectedMedicines.reduce((sum, med) => sum + med.price, 0);
        }
        
        if (extraServices.length > 0) {
            totalPrice += extraServices.reduce((sum, es) => sum + Number(es.price), 0);
        }

        const newPackage = new Package({ 
            name, 
            services, 
            medicines,
            extraServices,
            description,
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
        res.json(packages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching packages', error: error.message });
    }
};

exports.updatePackage = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, services, medicines, extraServices, description } = req.body;
        
        let updateData = { name, description };
        
        if (services !== undefined || medicines !== undefined || extraServices !== undefined) {
            let totalPrice = 0;
            
            const currentPackage = await Package.findById(id);
            const finalServices = services !== undefined ? services : currentPackage.services;
            const finalMedicines = medicines !== undefined ? medicines : currentPackage.medicines;
            const finalExtraServices = extraServices !== undefined ? extraServices : currentPackage.extraServices;
            
            if (finalServices && finalServices.length > 0) {
                const selectedServices = await Service.find({ _id: { $in: finalServices } });
                totalPrice += selectedServices.reduce((sum, service) => sum + service.price, 0);
            }
            if (finalMedicines && finalMedicines.length > 0) {
                const selectedMedicines = await Medicine.find({ _id: { $in: finalMedicines } });
                totalPrice += selectedMedicines.reduce((sum, med) => sum + med.price, 0);
            }
            if (finalExtraServices && finalExtraServices.length > 0) {
                totalPrice += finalExtraServices.reduce((sum, es) => sum + Number(es.price), 0);
            }
            
            updateData.totalPrice = totalPrice;
            if (services !== undefined) updateData.services = services;
            if (medicines !== undefined) updateData.medicines = medicines;
            if (extraServices !== undefined) updateData.extraServices = extraServices;
        }

        const updatedPackage = await Package.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('services').populate('medicines');
        
        if (!updatedPackage) {
            return res.status(404).json({ message: 'Package not found' });
        }
        res.json(updatedPackage);
    } catch (error) {
        res.status(500).json({ message: 'Error updating package', error: error.message });
    }
};

exports.deletePackage = async (req, res) => {
    try {
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
