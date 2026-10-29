// Sidebar ke saare modules jinka access Superadmin "Roles & Permissions" se on/off kar sakta hai.
// defaults = abhi tak jo hardcoded tha (Layout.jsx), taaki kuchh bhi change na ho jab tak Superadmin khud na badle.
// Dashboard aur Website Settings yahan nahi hain: Dashboard sabko dikhta hai, Website Settings sirf Superadmin ko.
// actions = page ke andar ke hisse (buttons/sections). Inki key "module:action" banti hai, jaise 'rule-management:create'.
// Action tabhi kaam karta hai jab module khud on ho.
// NOTE: frontend/src/permissions/modules.js mein bhi same keys aur defaults hain, dono sync rakhna.

// Rule aur SOP pages ek jaise hain, isliye dono ke actions same hain
const groupPointActions = (noun) => [
    { key: 'create', label: `Add ${noun} Group`, defaults: { admin: true, team: false } },
    { key: 'edit', label: `Edit ${noun} Group`, defaults: { admin: true, team: false } },
    { key: 'delete', label: `Delete ${noun} Group`, defaults: { admin: true, team: false } },
    { key: 'points-add', label: 'Add Points', defaults: { admin: true, team: false } },
    { key: 'points-edit', label: 'Edit Points', defaults: { admin: true, team: false } },
    { key: 'points-delete', label: 'Delete Points', defaults: { admin: true, team: false } },
    { key: 'filters', label: 'Role / User Filters', defaults: { admin: true, team: true } }
];
const PERMISSION_MODULES = [
    {
        key: 'admin-management', label: 'Admin Management', defaults: { admin: false, team: false },
        actions: [
            { key: 'create', label: 'Add Admin', defaults: { admin: false, team: false } },
            { key: 'edit', label: 'Edit Admin', defaults: { admin: false, team: false } },
            { key: 'delete', label: 'Delete Admin', defaults: { admin: false, team: false } },
            { key: 'password', label: 'Change Password', defaults: { admin: false, team: false } }
        ]
    },
    {
        key: 'team-management', label: 'Team Management', defaults: { admin: true, team: false },
        actions: [
            { key: 'create', label: 'Add Member', defaults: { admin: true, team: false } },
            { key: 'edit', label: 'Edit Member', defaults: { admin: true, team: false } },
            { key: 'delete', label: 'Delete Member', defaults: { admin: true, team: false } },
            { key: 'password', label: 'Change Password', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'schedule-management', label: 'Schedule Management', defaults: { admin: false, team: false },
        actions: [
            { key: 'create', label: 'Add Schedule', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Schedule', defaults: { admin: true, team: true } },
            { key: 'delete', label: 'Delete Schedule', defaults: { admin: true, team: true } },
            { key: 'google-sync', label: 'Google Calendar Sync', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'appointments', label: 'Appointments', defaults: { admin: true, team: true },
        actions: [
            { key: 'create', label: 'Add Appointment', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Appointment', defaults: { admin: true, team: true } },
            { key: 'status', label: 'Change Status', defaults: { admin: true, team: true } },
            { key: 'delete', label: 'Delete Appointment', defaults: { admin: true, team: true } },
            { key: 'sale-entry', label: 'Sale Entry / Bill', defaults: { admin: true, team: true } },
            { key: 'details', label: 'View Details', defaults: { admin: true, team: true } }
        ]
    },
    { key: 'sop-management', label: 'SOP Management', defaults: { admin: true, team: false }, actions: groupPointActions('SOP') },
    { key: 'rule-management', label: 'Rule Management', defaults: { admin: true, team: false }, actions: groupPointActions('Rule') },
    {
        key: 'my-workspace', label: 'My SOP and Rules', defaults: { admin: true, team: true },
        actions: [
            { key: 'sop-tab', label: 'My SOP Tab', defaults: { admin: true, team: true } },
            { key: 'rules-tab', label: 'My Rules Tab', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'tasks', label: 'Task Management', defaults: { admin: true, team: true },
        actions: [
            { key: 'create', label: 'Add Task', defaults: { admin: true, team: true } },
            { key: 'bulk-add', label: 'Bulk Add Tasks', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Task', defaults: { admin: true, team: true } },
            { key: 'delete', label: 'Delete Task', defaults: { admin: true, team: true } },
            { key: 'status', label: 'Change Status', defaults: { admin: true, team: true } },
            { key: 'team-tab', label: 'Team Tasks Tab', defaults: { admin: true, team: true } },
            { key: 'overview', label: 'Tasks Overview', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'patients', label: 'Patient Database', defaults: { admin: true, team: true },
        actions: [
            { key: 'create', label: 'Add Patient', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Patient', defaults: { admin: true, team: true } },
            { key: 'status', label: 'Active / Inactive', defaults: { admin: true, team: true } },
            { key: 'delete', label: 'Delete Patient', defaults: { admin: true, team: false } },
            { key: 'details', label: 'View Full Details', defaults: { admin: true, team: true } },
            { key: 'history', label: 'Appointment History', defaults: { admin: true, team: true } },
            { key: 'birthdays', label: 'Birthday Wishes', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'leads', label: 'Leads', defaults: { admin: true, team: true },
        actions: [
            { key: 'create', label: 'Add Lead', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Lead', defaults: { admin: true, team: true } },
            { key: 'status', label: 'Change Status', defaults: { admin: true, team: true } },
            { key: 'assign', label: 'Assign Lead', defaults: { admin: true, team: false } },
            { key: 'delete', label: 'Delete Lead', defaults: { admin: true, team: true } },
            { key: 'followup', label: 'Schedule Follow Up', defaults: { admin: true, team: true } },
            { key: 'history-edit', label: 'Edit History', defaults: { admin: true, team: true } },
            { key: 'birthday', label: 'Birthday Messages', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'reminders', label: 'Reminders', defaults: { admin: true, team: true },
        actions: [
            { key: 'status', label: 'Change Status', defaults: { admin: true, team: true } },
            { key: 'followup', label: 'Schedule Follow Up', defaults: { admin: true, team: true } },
            { key: 'history', label: 'View History', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'call-logs', label: 'Call Logs', defaults: { admin: true, team: false },
        actions: [
            { key: 'view-all', label: 'View All Logs', defaults: { admin: true, team: false } },
            { key: 'filters', label: 'Team / Admin Filter', defaults: { admin: true, team: true } },
            { key: 'export', label: 'Export PDF', defaults: { admin: true, team: true } },
            { key: 'delete', label: 'Delete Others\' Logs', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'holidays', label: 'Holidays & Events', defaults: { admin: true, team: true },
        actions: [
            { key: 'add', label: 'Add Holiday', defaults: { admin: true, team: false } },
            { key: 'delete', label: 'Delete Holiday', defaults: { admin: true, team: false } },
            { key: 'declare', label: 'Declare Holiday', defaults: { admin: true, team: false } },
            { key: 'paid-tag', label: 'Paid / Unpaid Tag', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'leaves', label: 'Leave Management', defaults: { admin: true, team: true },
        actions: [
            { key: 'apply', label: 'Apply Leave', defaults: { admin: true, team: true } },
            { key: 'approve', label: 'Approve / Reject Leave', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'services', label: 'Services & Packages', defaults: { admin: true, team: true },
        actions: [
            { key: 'service-add', label: 'Add Service', defaults: { admin: true, team: true } },
            { key: 'service-edit', label: 'Edit Service', defaults: { admin: true, team: true } },
            { key: 'service-delete', label: 'Delete Service', defaults: { admin: true, team: true } },
            { key: 'package-add', label: 'Add Package', defaults: { admin: true, team: true } },
            { key: 'package-edit', label: 'Edit Package', defaults: { admin: true, team: true } },
            { key: 'package-delete', label: 'Delete Package', defaults: { admin: true, team: true } },
            { key: 'medicine-add', label: 'Add Medicine', defaults: { admin: true, team: true } },
            { key: 'medicine-edit', label: 'Edit Medicine', defaults: { admin: true, team: true } },
            { key: 'medicine-delete', label: 'Delete Medicine', defaults: { admin: true, team: true } },
            { key: 'medicine-price', label: 'View Medicine Price', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'daily-reports', label: 'Daily Team Report', defaults: { admin: true, team: true },
        actions: [
            { key: 'submit', label: 'Submit Own Report', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Team Reports', defaults: { admin: true, team: false } },
            { key: 'delete', label: 'Delete Report', defaults: { admin: true, team: true } },
            { key: 'view', label: 'View Report Details', defaults: { admin: true, team: true } },
            { key: 'view-team', label: 'View Team Reports', defaults: { admin: true, team: true } },
            { key: 'filters', label: 'Role / User Filters', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'checklist-templates', label: 'Checklist Templates', defaults: { admin: true, team: false },
        actions: [
            { key: 'create', label: 'Add Template', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Template', defaults: { admin: true, team: true } },
            { key: 'delete', label: 'Delete Template', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'complaints', label: 'Complaint Box', defaults: { admin: true, team: true },
        actions: [
            { key: 'create', label: 'Add Complaint', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Complaint', defaults: { admin: true, team: true } },
            { key: 'view-all', label: 'View All Complaints', defaults: { admin: true, team: false } },
            { key: 'status', label: 'Change Status', defaults: { admin: true, team: false } },
            { key: 'delete', label: 'Delete Complaint', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'attendance', label: 'Attendance', defaults: { admin: true, team: false },
        actions: [
            { key: 'view-team', label: 'View Team Attendance', defaults: { admin: true, team: false } },
            { key: 'edit', label: 'Mark / Edit Attendance', defaults: { admin: true, team: false } },
            { key: 'photos', label: 'View Selfie Photos', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'payroll', label: 'Payroll & Salaries', defaults: { admin: true, team: false },
        actions: [
            { key: 'summary', label: 'Summary Cards', defaults: { admin: true, team: false } },
            { key: 'logs', label: 'Attendance Logs', defaults: { admin: true, team: false } },
            { key: 'pdf', label: 'Download PDF', defaults: { admin: true, team: false } },
            { key: 'pay', label: 'Pay Salary', defaults: { admin: true, team: false } },
            { key: 'incentives', label: 'Commission / Bonus', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'payments', label: 'Payments & Finances', defaults: { admin: false, team: false },
        actions: [
            { key: 'new-sale', label: 'New Sale', defaults: { admin: true, team: true } },
            { key: 'collect', label: 'Collect Payment', defaults: { admin: true, team: true } },
            { key: 'invoice-edit', label: 'Edit Invoice', defaults: { admin: true, team: true } },
            { key: 'invoice-delete', label: 'Delete Invoice', defaults: { admin: true, team: true } },
            { key: 'collections', label: 'Collections Tab', defaults: { admin: true, team: true } },
            { key: 'collection-edit', label: 'Edit / Delete Collection', defaults: { admin: true, team: true } },
            { key: 'expenses', label: 'Expenses Tab', defaults: { admin: true, team: true } },
            { key: 'expense-add', label: 'Add Expense', defaults: { admin: true, team: true } },
            { key: 'expense-edit', label: 'Edit / Delete Expense', defaults: { admin: true, team: true } },
            { key: 'reports', label: 'Download Reports / PDF', defaults: { admin: true, team: true } },
            { key: 'opening-balance', label: 'Set Opening Balance', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'pharmacy-bills', label: 'Pharmacy Bills', defaults: { admin: false, team: false },
        actions: [
            { key: 'create', label: 'Add Bill', defaults: { admin: true, team: true } },
            { key: 'edit', label: 'Edit Bill', defaults: { admin: true, team: true } },
            { key: 'delete', label: 'Delete Bill', defaults: { admin: true, team: true } },
            { key: 'payment', label: 'Add / Remove Payment', defaults: { admin: true, team: true } },
            { key: 'stock-add', label: 'Add Medicine Qty (in Bill)', defaults: { admin: true, team: true } },
            { key: 'stock-tracking', label: 'Medicine Stock Tracking', defaults: { admin: true, team: true } },
            { key: 'stock-manual', label: 'Manual Stock Out (without Sale Entry)', defaults: { admin: true, team: false } }
        ]
    },
    {
        key: 'payment-qr', label: 'Payment QR', defaults: { admin: false, team: false },
        actions: [
            { key: 'upi-config', label: 'Save / Clear UPI ID', defaults: { admin: true, team: true } },
            { key: 'copy', label: 'Copy QR Image', defaults: { admin: true, team: true } }
        ]
    },
    {
        key: 'home-expense', label: 'Home Expense', defaults: { admin: false, team: false },
        actions: [
            { key: 'members', label: 'Add / Delete Members', defaults: { admin: true, team: true } },
            { key: 'expense-add', label: 'Add Expense', defaults: { admin: true, team: true } },
            { key: 'expense-delete', label: 'Delete Expense', defaults: { admin: true, team: true } }
        ]
    }
];

const PERMISSION_ROLES = ['admin', 'team'];

// Saari permission keys (module + module:action) unke defaults ke saath
const PERMISSION_KEYS = [];
PERMISSION_MODULES.forEach(m => {
    PERMISSION_KEYS.push({ key: m.key, defaults: m.defaults });
    (m.actions || []).forEach(a => PERMISSION_KEYS.push({ key: `${m.key}:${a.key}`, defaults: a.defaults }));
});

module.exports = { PERMISSION_MODULES, PERMISSION_ROLES, PERMISSION_KEYS };
