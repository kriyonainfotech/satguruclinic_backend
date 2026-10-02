const Medicine = require('../models/Medicine');

exports.createMedicine = async (req, res) => {
    try {
        const newMedicine = new Medicine(req.body);
        await newMedicine.save();
        res.status(201).json(newMedicine);
    } catch (error) {
        res.status(500).json({ message: 'Error creating Medicine', error: error.message });
    }
};

exports.getMedicines = async (req, res) => {
    try {
        const Medicines = await Medicine.find().sort({ createdAt: -1 });
        res.json(Medicines);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching Medicines', error: error.message });
    }
};

exports.updateMedicine = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedMedicine = await Medicine.findByIdAndUpdate(
            id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!updatedMedicine) {
            return res.status(404).json({ message: 'Medicine not found' });
        }
        res.json(updatedMedicine);
    } catch (error) {
        res.status(500).json({ message: 'Error updating Medicine', error: error.message });
    }
};

exports.deleteMedicine = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedMedicine = await Medicine.findByIdAndDelete(id);
        if (!deletedMedicine) {
            return res.status(404).json({ message: 'Medicine not found' });
        }
        res.json({ message: 'Medicine deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting Medicine', error: error.message });
    }
};
