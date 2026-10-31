const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const PharmacyBill = require('../models/PharmacyBill');
const Medicine = require('../models/Medicine');
const Invoice = require('../models/Invoice');
const StockOut = require('../models/StockOut');
const Expense = require('../models/Expense');
const Collection = require('../models/Collection');
const OpeningBalance = require('../models/OpeningBalance');
const authMiddleware = require('../middleware/authMiddleware');
const { findOrCreateByName } = require('../controllers/medicineController');
const { getUserPermissions, checkPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'You do not have permission to do this' });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(n * 100) / 100;
// Payments & Finances ke accounts
const ACCOUNTS = ['Cash', 'Company Bank', 'Personal Bank'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Finance ke expenses me date "30 Oct 2026" format me rehti hai
const financeDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
};
const expenseParty = (bill) => `${bill.supplierName}${bill.billNumber ? ` (Bill ${bill.billNumber})` : ''}`;

router.use(authMiddleware);

// Har route pe module + action permission check
const requirePermission = (key) => async (req, res, next) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, key)) return denied(res);
        next();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const findBill = async (id, res) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ message: 'Bill not found' });
        return null;
    }
    const bill = await PharmacyBill.findById(id);
    if (!bill) res.status(404).json({ message: 'Bill not found' });
    return bill;
};

// Bill ki details body se validate karke nikalna (create + edit dono me)
const readBillFields = (body) => {
    const supplierName = (body.supplierName || '').trim();
    const totalAmount = Number(body.totalAmount);
    if (!supplierName) return { error: 'Please enter the supplier / pharma name' };
    if (!DATE_RE.test(body.billDate || '')) return { error: 'Please select the bill date' };
    if (body.dueDate && !DATE_RE.test(body.dueDate)) return { error: 'Invalid due date' };
    if (!Number.isFinite(totalAmount) || totalAmount < 0) return { error: 'Please enter a valid bill amount' };
    return {
        fields: {
            supplierName,
            billNumber: (body.billNumber || '').trim(),
            billDate: body.billDate,
            dueDate: body.dueDate || '',
            items: (body.items || '').trim(),
            totalAmount: round2(totalAmount),
            notes: (body.notes || '').trim()
        }
    };
};

// Bill me aayi medicines: [{ medicine?, name, category, qty }]. Master list wali medicine ka naam/category wahi se.
const readStockItems = async (list) => {
    if (!Array.isArray(list)) return { stockItems: [] };
    const ids = list.map(i => i && i.medicine).filter(id => mongoose.Types.ObjectId.isValid(id));
    const meds = await Medicine.find({ _id: { $in: ids } }).select('name category');
    const medMap = Object.fromEntries(meds.map(m => [String(m._id), m]));
    const stockItems = [];
    for (const raw of list) {
        if (!raw) continue;
        let med = medMap[String(raw.medicine)];
        const name = (med ? med.name : String(raw.name || '')).trim();
        const qty = Number(raw.qty);
        if (!name) return { error: 'Please select or type the medicine name for every row' };
        if (!Number.isFinite(qty) || qty <= 0) return { error: `Please enter a valid quantity for ${name}` };
        // Naam type kiya (list se nahi chuna) to medicine list me bana do, taaki packages / appointment me bhi aaye
        if (!med) med = (await findOrCreateByName(name)).medicine;
        stockItems.push({
            medicine: med ? med._id : null,
            name,
            category: (med ? med.category : String(raw.category || '')).trim(),
            qty: Math.round(qty)
        });
    }
    return { stockItems };
};

// Items column / search ke liye text: "Dolo 650 x 20, Crocin x 10"
const stockItemsText = (stockItems) => stockItems.map(i => `${i.name} x ${i.qty}`).join(', ');

const readPayment = (body, pending, userId) => {
    const amount = round2(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Please enter a valid payment amount' };
    if (amount > pending) return { error: `Payment cannot be more than the pending amount (${pending})` };
    if (!DATE_RE.test(body.date || '')) return { error: 'Please select the payment date' };
    if (!ACCOUNTS.includes(body.account)) return { error: 'Please select the account the payment was made from' };
    return {
        payment: {
            amount,
            date: body.date,
            note: (body.note || '').trim(),
            account: body.account,
            createdBy: userId
        }
    };
};

// Payment ko Finance ke Expenses me daalna (category "Pharmacy Purchase"), payment.expense me uska id
const addPaymentExpense = async (bill, payment) => {
    const expense = await Expense.create({
        date: financeDate(payment.date),
        party: expenseParty(bill),
        amount: payment.amount,
        category: 'Pharmacy Purchase',
        account: payment.account,
        notes: payment.note,
        pharmacyBill: bill._id
    });
    payment.expense = expense._id;
    return expense;
};

// Account me kitna paisa bacha: opening balance + collections - expenses (Payments & Finances jaisa hi)
router.get('/account-balances', requirePermission('pharmacy-bills'), async (req, res) => {
    try {
        const [opening, collections, expenses] = await Promise.all([
            OpeningBalance.findOne(),
            Collection.find().select('account amount'),
            Expense.find().select('account amount')
        ]);
        const balances = {
            'Cash': opening?.cash || 0,
            'Personal Bank': opening?.personal || 0,
            'Company Bank': opening?.company || 0
        };
        collections.forEach(c => { if (c.account in balances) balances[c.account] += c.amount || 0; });
        expenses.forEach(e => { if (e.account in balances) balances[e.account] -= e.amount || 0; });
        Object.keys(balances).forEach(k => { balances[k] = round2(balances[k]); });
        res.json(balances);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/', requirePermission('pharmacy-bills'), async (req, res) => {
    try {
        const bills = await PharmacyBill.find()
            .populate('createdBy', 'name')
            .sort({ billDate: -1, createdAt: -1 });
        res.json(bills);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Naya bill. Bill ke saath hi kuch payment kar diya ho to body.paidAmount
router.post('/', requirePermission('pharmacy-bills:create'), async (req, res) => {
    try {
        const { fields, error } = readBillFields(req.body);
        if (error) return res.status(400).json({ message: error });

        // Medicine quantity sirf "Add Medicine Qty" permission ho to
        const permissions = await getUserPermissions(req.user);
        if (checkPermission(permissions, 'pharmacy-bills:stock-add')) {
            const { stockItems, error: stockError } = await readStockItems(req.body.stockItems);
            if (stockError) return res.status(400).json({ message: stockError });
            fields.stockItems = stockItems;
            if (stockItems.length) fields.items = stockItemsText(stockItems);
        }

        const bill = new PharmacyBill({ ...fields, createdBy: req.user.userId });
        let expense = null;
        if (Number(req.body.paidAmount) > 0) {
            const { payment, error: payError } = readPayment({
                amount: req.body.paidAmount,
                date: req.body.paymentDate || fields.billDate,
                note: 'Paid at bill entry',
                account: req.body.paymentAccount
            }, fields.totalAmount, req.user.userId);
            if (payError) return res.status(400).json({ message: payError });
            expense = await addPaymentExpense(bill, payment);
            bill.payments.push(payment);
        }
        try {
            await bill.save();
        } catch (err) {
            if (expense) await Expense.deleteOne({ _id: expense._id });
            throw err;
        }
        await bill.populate('createdBy', 'name');
        res.status(201).json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.put('/:id', requirePermission('pharmacy-bills:edit'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        const { fields, error } = readBillFields(req.body);
        if (error) return res.status(400).json({ message: error });
        if (fields.totalAmount < bill.paidAmount) {
            return res.status(400).json({ message: `Bill amount cannot be less than the amount already paid (${bill.paidAmount})` });
        }
        const permissions = await getUserPermissions(req.user);
        if (checkPermission(permissions, 'pharmacy-bills:stock-add') && Array.isArray(req.body.stockItems)) {
            const { stockItems, error: stockError } = await readStockItems(req.body.stockItems);
            if (stockError) return res.status(400).json({ message: stockError });
            fields.stockItems = stockItems;
            if (stockItems.length) fields.items = stockItemsText(stockItems);
        } else if (bill.stockItems.length) {
            // Permission nahi to purani medicines aur unka text waisa hi rahe
            fields.items = bill.items;
        }
        Object.assign(bill, fields);
        await bill.save();
        // Supplier / bill no. badla to Finance ke expenses me bhi naam badlo
        await Expense.updateMany({ pharmacyBill: bill._id }, { party: expenseParty(bill) });
        await bill.populate('createdBy', 'name');
        res.json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.delete('/:id', requirePermission('pharmacy-bills:delete'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        await bill.deleteOne();
        await Expense.deleteMany({ pharmacyBill: bill._id });
        res.json({ message: 'Bill deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Bill ke against payment add karna
router.post('/:id/payments', requirePermission('pharmacy-bills:payment'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        const { payment, error } = readPayment(req.body, bill.pendingAmount, req.user.userId);
        if (error) return res.status(400).json({ message: error });
        const expense = await addPaymentExpense(bill, payment);
        bill.payments.push(payment);
        try {
            await bill.save();
        } catch (err) {
            await Expense.deleteOne({ _id: expense._id });
            throw err;
        }
        await bill.populate('createdBy', 'name');
        res.status(201).json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Galat payment entry hatana
router.delete('/:id/payments/:paymentId', requirePermission('pharmacy-bills:payment'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        const payment = bill.payments.id(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });
        const expenseId = payment.expense;
        payment.deleteOne();
        await bill.save();
        if (expenseId) await Expense.deleteOne({ _id: expenseId });
        await bill.populate('createdBy', 'name');
        res.json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ---------- Medicine Stock Tracking ----------
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Purane invoices: work text "Dolo 650 [Qty: 2] (5 days - Rs.100), ..." se medicine aur qty
const parseWorkMedicines = (work) => {
    const items = [];
    const re = /(?:^|,\s*)([^,]+?)\s*\[Qty:\s*(\d+)\]/g;
    let m;
    while ((m = re.exec(work || '')) !== null) items.push({ medicine: null, name: m[1].trim(), qty: Number(m[2]) || 1 });
    return items;
};

// Manual entry ka time: aaj ki date hi chuni ho to save ka time, warna us din dopahar 12 baje
// (taaki din / ghante wise chart me sahi jagah aaye)
const stockOutAt = (o) => (o.date === toISO(o.createdAt) ? o.createdAt : new Date(`${o.date}T12:00:00`));

const STOCK_OUT_REASONS = ['Sold manually', 'Given free', 'Staff use', 'Damaged / Expired', 'Returned to supplier', 'Other'];

// Har medicine: kitni aayi (bills), kitni bechi (sales + manual entries), clinic me kitni bachi, aur aaj / is hafte / is mahine kitni bechi
router.get('/stock', requirePermission('pharmacy-bills:stock-tracking'), async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - ((todayStart.getDay() + 6) % 7)); // Monday se
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        // Pichhle mahine ki 1 tareekh se events (charts + kal / pichhle hafte / pichhle mahine se tulna)
        const eventsFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const eventsFromISO = toISO(eventsFrom);
        const todayISO = toISO(todayStart);
        const weekISO = toISO(weekStart);
        const monthISO = toISO(monthStart);

        const [medicines, bills, invoices, stockOuts] = await Promise.all([
            Medicine.find().select('name category'),
            PharmacyBill.find({ 'stockItems.0': { $exists: true } }).select('billDate supplierName stockItems'),
            Invoice.find({ $or: [{ 'medicineItems.0': { $exists: true } }, { work: /\[Qty:/ }] }).select('work medicineItems createdAt'),
            StockOut.find().select('date items createdAt')
        ]);

        const rows = {};
        const byName = {};
        const soldEvents = [];
        const receivedEvents = [];
        const blank = (key, name, category) => ({
            key, name, category: category || 'Other',
            received: 0, receivedToday: 0, receivedWeek: 0, receivedMonth: 0,
            sold: 0, soldToday: 0, soldWeek: 0, soldMonth: 0,
            lastReceived: ''
        });
        medicines.forEach(m => {
            const key = String(m._id);
            rows[key] = blank(key, m.name, m.category);
            byName[m.name.trim().toLowerCase()] = key;
        });
        // id se, warna naam se master list me milao, warna naam wali alag row
        const rowFor = (item) => {
            if (item.medicine && rows[String(item.medicine)]) return rows[String(item.medicine)];
            const lower = item.name.trim().toLowerCase();
            if (byName[lower]) return rows[byName[lower]];
            const key = 'name:' + lower;
            if (!rows[key]) rows[key] = blank(key, item.name.trim(), item.category);
            return rows[key];
        };

        bills.forEach(b => {
            b.stockItems.forEach(item => {
                const row = rowFor(item);
                row.received += item.qty;
                if (b.billDate === todayISO) row.receivedToday += item.qty;
                if (b.billDate >= weekISO) row.receivedWeek += item.qty;
                if (b.billDate >= monthISO) row.receivedMonth += item.qty;
                if (b.billDate > row.lastReceived) row.lastReceived = b.billDate;
                if (b.billDate >= eventsFromISO) receivedEvents.push({ key: row.key, qty: item.qty, date: b.billDate });
            });
        });

        invoices.forEach(inv => {
            const items = inv.medicineItems && inv.medicineItems.length ? inv.medicineItems : parseWorkMedicines(inv.work);
            const at = inv.createdAt;
            items.forEach(item => {
                const row = rowFor(item);
                row.sold += item.qty;
                if (at >= todayStart) row.soldToday += item.qty;
                if (at >= weekStart) row.soldWeek += item.qty;
                if (at >= monthStart) row.soldMonth += item.qty;
                if (at >= eventsFrom) soldEvents.push({ key: row.key, qty: item.qty, at, invoiceId: inv._id });
            });
        });

        // Manual entries (Sale Entry ke bina nikali medicine) bhi stock se kam hoti hain
        stockOuts.forEach(o => {
            const at = stockOutAt(o);
            o.items.forEach(item => {
                const row = rowFor(item);
                row.sold += item.qty;
                if (at >= todayStart) row.soldToday += item.qty;
                if (at >= weekStart) row.soldWeek += item.qty;
                if (at >= monthStart) row.soldMonth += item.qty;
                if (at >= eventsFrom) soldEvents.push({ key: row.key, qty: item.qty, at, invoiceId: `out-${o._id}` });
            });
        });

        const list = Object.values(rows)
            .map(r => ({ ...r, inStock: r.received - r.sold }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json({
            rows: list,
            periods: { today: todayISO, weekStart: weekISO, monthStart: monthISO },
            events: { sold: soldEvents, received: receivedEvents }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Ek medicine ki history: kis bill me kitni aayi aur kisne (Team / Admin / Super Admin) kab kis patient ko kitni bechi.
// key = medicine id, ya list ke bahar wali medicine ke liye 'name:<naam>'
router.get('/stock/history', requirePermission('pharmacy-bills:stock-tracking'), async (req, res) => {
    try {
        const key = String(req.query.key || '');
        let medId = null;
        let nameLower = '';
        if (key.startsWith('name:')) {
            nameLower = key.slice(5).trim().toLowerCase();
        } else if (mongoose.Types.ObjectId.isValid(key)) {
            const med = await Medicine.findById(key).select('name');
            if (!med) return res.status(404).json({ message: 'Medicine not found' });
            medId = String(med._id);
            nameLower = med.name.trim().toLowerCase();
        } else {
            return res.status(400).json({ message: 'Invalid medicine' });
        }
        // /stock jaisa hi milan: id same ho, ya naam same ho
        const matches = (item) => (medId && item.medicine && String(item.medicine) === medId)
            || String(item.name || '').trim().toLowerCase() === nameLower;

        const [bills, invoices, stockOuts] = await Promise.all([
            PharmacyBill.find({ 'stockItems.0': { $exists: true } })
                .select('billDate billNumber supplierName stockItems createdBy createdAt')
                .populate('createdBy', 'name role'),
            Invoice.find({ $or: [{ 'medicineItems.0': { $exists: true } }, { work: /\[Qty:/ }] })
                .select('client mobile date work medicineItems createdAt createdBy createdByName')
                .populate('createdBy', 'name role'),
            StockOut.find().populate('createdBy', 'name role')
        ]);

        const received = [];
        bills.forEach(b => {
            const qty = b.stockItems.filter(matches).reduce((sum, i) => sum + i.qty, 0);
            if (!qty) return;
            received.push({
                billId: b._id,
                billDate: b.billDate,
                billNumber: b.billNumber,
                supplierName: b.supplierName,
                qty,
                byName: b.createdBy?.name || '',
                byRole: b.createdBy?.role || ''
            });
        });

        const sold = [];
        invoices.forEach(inv => {
            const items = inv.medicineItems && inv.medicineItems.length ? inv.medicineItems : parseWorkMedicines(inv.work);
            const qty = items.filter(matches).reduce((sum, i) => sum + i.qty, 0);
            if (!qty) return;
            sold.push({
                invoiceId: inv._id,
                at: inv.createdAt,
                patient: inv.client,
                mobile: inv.mobile || '',
                qty,
                byName: inv.createdBy?.name || inv.createdByName || '',
                byRole: inv.createdBy?.role || ''
            });
        });

        stockOuts.forEach(o => {
            const qty = o.items.filter(matches).reduce((sum, i) => sum + i.qty, 0);
            if (!qty) return;
            sold.push({
                invoiceId: `out-${o._id}`,
                at: stockOutAt(o),
                patient: o.person,
                mobile: '',
                qty,
                manual: true,
                reason: o.reason,
                note: o.note,
                byName: o.createdBy?.name || '',
                byRole: o.createdBy?.role || ''
            });
        });

        received.sort((a, b) => b.billDate.localeCompare(a.billDate));
        sold.sort((a, b) => new Date(b.at) - new Date(a.at));
        res.json({ received, sold });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ---------- Manual entry: Sale Entry ke bina medicine nikali ----------
router.get('/stock-outs', requirePermission('pharmacy-bills:stock-tracking'), async (req, res) => {
    try {
        const outs = await StockOut.find().populate('createdBy', 'name role').sort({ date: -1, createdAt: -1 }).limit(300);
        res.json({ entries: outs.map(o => ({ ...o.toObject(), at: stockOutAt(o) })), reasons: STOCK_OUT_REASONS });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/stock-outs', requirePermission('pharmacy-bills:stock-manual'), async (req, res) => {
    try {
        if (!DATE_RE.test(req.body.date || '')) return res.status(400).json({ message: 'Please select the date' });
        if (req.body.date > toISO(new Date())) return res.status(400).json({ message: 'Date cannot be in the future' });
        const reason = String(req.body.reason || '').trim();
        if (!reason) return res.status(400).json({ message: 'Please select a reason' });
        const { stockItems, error } = await readStockItems(req.body.items);
        if (error) return res.status(400).json({ message: error });
        if (!stockItems.length) return res.status(400).json({ message: 'Please add at least one medicine' });

        const out = new StockOut({
            date: req.body.date,
            items: stockItems,
            reason,
            person: String(req.body.person || '').trim(),
            note: String(req.body.note || '').trim(),
            createdBy: req.user.userId
        });
        await out.save();
        await out.populate('createdBy', 'name role');
        res.status(201).json({ ...out.toObject(), at: stockOutAt(out) });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.delete('/stock-outs/:id', requirePermission('pharmacy-bills:stock-manual'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Entry not found' });
        const out = await StockOut.findByIdAndDelete(req.params.id);
        if (!out) return res.status(404).json({ message: 'Entry not found' });
        res.json({ message: 'Entry deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
