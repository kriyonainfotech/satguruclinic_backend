const Medicine = require('../models/Medicine');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

exports.createMedicine = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'pharmacy-bills:medicine-add'))) return denied(res);
        const newMedicine = new Medicine(req.body);
        await newMedicine.save();
        res.status(201).json(newMedicine);
    } catch (error) {
        res.status(500).json({ message: 'Error creating Medicine', error: error.message });
    }
};

// Naam se medicine dhoondo (capital / small ka farak nahi), na mile to price 0 ke saath bana do
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findOrCreateByName = async (rawName) => {
    const name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!name) return null;
    const existing = await Medicine.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (existing) return { medicine: existing, created: false };
    const medicine = await Medicine.create({ name, category: 'Other', price: 0 });
    return { medicine, created: true };
};
exports.findOrCreateByName = findOrCreateByName;

// Appointment / Sale Entry ke dropdown me naya naam likha to medicine list me ban jaye
exports.quickCreateMedicine = async (req, res) => {
    try {
        const allowed = await hasPermission(req.user, 'pharmacy-bills:medicine-add') || await hasPermission(req.user, 'appointments');
        if (!allowed) return denied(res);
        const result = await findOrCreateByName(req.body.name);
        if (!result) return res.status(400).json({ message: 'Medicine name is required' });
        res.status(result.created ? 201 : 200).json(result.medicine);
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
        if (!(await hasPermission(req.user, 'pharmacy-bills:medicine-edit'))) return denied(res);
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
        if (!(await hasPermission(req.user, 'pharmacy-bills:medicine-delete'))) return denied(res);
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
