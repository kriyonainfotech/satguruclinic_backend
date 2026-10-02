const Service = require('../models/Service');

exports.createService = async (req, res) => {
    try {
        const { name, price, description } = req.body;
        const newService = new Service({ name, price, description });
        await newService.save();
        res.status(201).json(newService);
    } catch (error) {
        res.status(500).json({ message: 'Error creating service', error: error.message });
    }
};

exports.getServices = async (req, res) => {
    try {
        const services = await Service.find().sort({ createdAt: -1 });
        res.json(services);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching services', error: error.message });
    }
};

exports.updateService = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedService = await Service.findByIdAndUpdate(
            id,
            req.body,
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
