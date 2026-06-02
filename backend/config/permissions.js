/**
 * Role-Based Access Control (RBAC) Configuration
 * Defines permissions for each role in the Carenix Clinic system
 */

// Define all available permissions
const PERMISSIONS = {
  // Patient permissions
  VIEW_DOCTORS: 'view_doctors',
  BOOK_APPOINTMENT: 'book_appointment',
  VIEW_OWN_APPOINTMENTS: 'view_own_appointments',
  CANCEL_APPOINTMENT: 'cancel_own_appointment',
  MESSAGE_DOCTOR: 'message_doctor',
  VIEW_OWN_MESSAGES: 'view_own_messages',
  VIEW_RESULTS: 'view_results',
  VIEW_MEDICATIONS: 'view_medications',
  VIEW_HEALTH_SUMMARY: 'view_health_summary',
  VIEW_NEXT_APPOINTMENT: 'view_next_appointment',
  
  // Doctor permissions
  VIEW_OWN_PATIENTS: 'view_own_patients',
  VIEW_PATIENT_RECORDS: 'view_patient_records',
  ADD_PATIENT_RECORDS: 'add_patient_records',
  UPDATE_PATIENT_RECORDS: 'update_patient_records',
  VIEW_PATIENT_APPOINTMENTS: 'view_patient_appointments',
  MANAGE_APPOINTMENTS: 'manage_appointments',
  PRESCRIBE_MEDICATION: 'prescribe_medication',
  ADD_RESULTS: 'add_results',
  VIEW_PATIENT_MESSAGES: 'view_patient_messages',
  REPLY_MESSAGES: 'reply_messages',
  ADD_HEALTH_SUMMARY: 'add_health_summary',
  CREATE_EXAMINATIONS: 'create_examinations',
  UPLOAD_REPORTS: 'upload_reports',
  MANAGE_ADMISSIONS: 'manage_admissions',
  MANAGE_ROUND_CHECKS: 'manage_round_checks',
  
  // Staff permissions
  VIEW_ALL_USERS: 'view_all_users',
  VIEW_ALL_APPOINTMENTS: 'view_all_appointments',
  MANAGE_ALL_APPOINTMENTS: 'manage_all_appointments',
  VIEW_ALL_RECORDS: 'view_all_records',
  MANAGE_USERS: 'manage_users',
  VIEW_ALL_MESSAGES: 'view_all_messages',
  VIEW_ALL_RESULTS: 'view_all_results',
  VIEW_ALL_MEDICATIONS: 'view_all_medications',
  VIEW_TEST_REFERRALS: 'view_test_referrals',
  VIEW_REPORTS: 'view_reports',
  MANAGE_TEST_REFERRALS: 'manage_test_referrals',
  VIEW_ADMISSIONS: 'view_admissions',
  VIEW_ROUND_CHECKS: 'view_round_checks',
  MANAGE_ROUND_CHECKS: 'manage_round_checks',
  
  // Customer Care Staff permissions
  REGISTER_WALKIN_PATIENTS: 'register_walkin_patients',
  VIEW_WALKIN_REGISTRATIONS: 'view_walkin_registrations',
  VIEW_ALL_TEST_REFERRALS: 'view_all_test_referrals',
  
  // Diagnostic Staff permissions
  UPLOAD_DIAGNOSTIC_RESULTS: 'upload_diagnostic_results',
  VIEW_PENDING_TESTS: 'view_pending_tests',

  // Pharmacy permissions
  MANAGE_PHARMACY: 'manage_pharmacy',
  VIEW_PHARMACY: 'view_pharmacy',
  DISPENSE_MEDICINE: 'dispense_medicine',
  VIEW_PHARMACY_SALES: 'view_pharmacy_sales',
  VIEW_PHARMACY_CUSTOMERS: 'view_pharmacy_customers',

  // Billing permissions
  MANAGE_BILLING: 'manage_billing',
  VIEW_BILLING: 'view_billing',
  CREATE_INVOICE: 'create_invoice',
  PROCESS_PAYMENT: 'process_payment',
};

// Define role-permission mapping
const ROLE_PERMISSIONS = {
  // Admin has ALL permissions (patient + doctor + staff + admin-specific)
  admin: [
    // Patient permissions
    PERMISSIONS.VIEW_DOCTORS,
    PERMISSIONS.BOOK_APPOINTMENT,
    PERMISSIONS.VIEW_OWN_APPOINTMENTS,
    PERMISSIONS.CANCEL_APPOINTMENT,
    PERMISSIONS.MESSAGE_DOCTOR,
    PERMISSIONS.VIEW_OWN_MESSAGES,
    PERMISSIONS.VIEW_RESULTS,
    PERMISSIONS.VIEW_MEDICATIONS,
    PERMISSIONS.VIEW_HEALTH_SUMMARY,
    PERMISSIONS.VIEW_NEXT_APPOINTMENT,
    // Doctor permissions
    PERMISSIONS.VIEW_OWN_PATIENTS,
    PERMISSIONS.VIEW_PATIENT_RECORDS,
    PERMISSIONS.ADD_PATIENT_RECORDS,
    PERMISSIONS.UPDATE_PATIENT_RECORDS,
    PERMISSIONS.VIEW_PATIENT_APPOINTMENTS,
    PERMISSIONS.MANAGE_APPOINTMENTS,
    PERMISSIONS.PRESCRIBE_MEDICATION,
    PERMISSIONS.ADD_RESULTS,
    PERMISSIONS.VIEW_PATIENT_MESSAGES,
    PERMISSIONS.REPLY_MESSAGES,
    PERMISSIONS.ADD_HEALTH_SUMMARY,
    PERMISSIONS.CREATE_EXAMINATIONS,
    PERMISSIONS.UPLOAD_REPORTS,
    // Pharmacy permissions
    PERMISSIONS.MANAGE_PHARMACY,
    PERMISSIONS.VIEW_PHARMACY,
    PERMISSIONS.DISPENSE_MEDICINE,
    // Billing permissions
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.CREATE_INVOICE,
    PERMISSIONS.PROCESS_PAYMENT,
    // Staff permissions
    PERMISSIONS.VIEW_ALL_USERS,
    PERMISSIONS.VIEW_ALL_APPOINTMENTS,
    PERMISSIONS.MANAGE_ALL_APPOINTMENTS,
    PERMISSIONS.VIEW_ALL_RECORDS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_ALL_MESSAGES,
    PERMISSIONS.VIEW_ALL_RESULTS,
    PERMISSIONS.VIEW_ALL_MEDICATIONS,
PERMISSIONS.VIEW_TEST_REFERRALS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_TEST_REFERRALS,
    PERMISSIONS.VIEW_PHARMACY,
    PERMISSIONS.DISPENSE_MEDICINE,
    // Billing permissions
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.CREATE_INVOICE,
    PERMISSIONS.PROCESS_PAYMENT,
  ],
  patient: [
    PERMISSIONS.VIEW_DOCTORS,
    PERMISSIONS.BOOK_APPOINTMENT,
    PERMISSIONS.VIEW_OWN_APPOINTMENTS,
    PERMISSIONS.CANCEL_APPOINTMENT,
    PERMISSIONS.MESSAGE_DOCTOR,
    PERMISSIONS.VIEW_OWN_MESSAGES,
    PERMISSIONS.VIEW_RESULTS,
    PERMISSIONS.VIEW_MEDICATIONS,
    PERMISSIONS.VIEW_HEALTH_SUMMARY,
    PERMISSIONS.VIEW_NEXT_APPOINTMENT,
    PERMISSIONS.VIEW_BILLING,
  ],
  doctor: [
    PERMISSIONS.VIEW_OWN_PATIENTS,
    PERMISSIONS.VIEW_PATIENT_RECORDS,
    PERMISSIONS.ADD_PATIENT_RECORDS,
    PERMISSIONS.UPDATE_PATIENT_RECORDS,
    PERMISSIONS.VIEW_PATIENT_APPOINTMENTS,
    PERMISSIONS.MANAGE_APPOINTMENTS,
    PERMISSIONS.PRESCRIBE_MEDICATION,
    PERMISSIONS.VIEW_MEDICATIONS,
    PERMISSIONS.ADD_RESULTS,
    PERMISSIONS.VIEW_PATIENT_MESSAGES,
    PERMISSIONS.REPLY_MESSAGES,
    PERMISSIONS.MESSAGE_DOCTOR,
    PERMISSIONS.ADD_HEALTH_SUMMARY,
    PERMISSIONS.CREATE_EXAMINATIONS,
    PERMISSIONS.UPLOAD_REPORTS,
    PERMISSIONS.MANAGE_ADMISSIONS,
    PERMISSIONS.MANAGE_ROUND_CHECKS,
    // Doctors can also view their own appointments
    PERMISSIONS.VIEW_OWN_APPOINTMENTS,
  ],
  staff: [
    PERMISSIONS.VIEW_ALL_USERS,
    PERMISSIONS.VIEW_ALL_APPOINTMENTS,
    PERMISSIONS.MANAGE_ALL_APPOINTMENTS,
    PERMISSIONS.VIEW_ALL_RECORDS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_ALL_MESSAGES,
    PERMISSIONS.VIEW_ALL_RESULTS,
    PERMISSIONS.VIEW_ALL_MEDICATIONS,
PERMISSIONS.VIEW_TEST_REFERRALS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_TEST_REFERRALS,
    PERMISSIONS.VIEW_PHARMACY,
    PERMISSIONS.DISPENSE_MEDICINE,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.CREATE_INVOICE,
    PERMISSIONS.PROCESS_PAYMENT,
  ],
  // Customer Care Staff - can register walk-in patients and view all test referrals
  customer_care: [
    PERMISSIONS.VIEW_ALL_TEST_REFERRALS,
    PERMISSIONS.REGISTER_WALKIN_PATIENTS,
    PERMISSIONS.VIEW_WALKIN_REGISTRATIONS,
    PERMISSIONS.VIEW_REPORTS,
  ],
  // Diagnostic Staff - can upload diagnostic test results
diagnostic: [
    PERMISSIONS.VIEW_PENDING_TESTS,
    PERMISSIONS.UPLOAD_DIAGNOSTIC_RESULTS,
    PERMISSIONS.VIEW_TEST_REFERRALS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_OWN_PATIENTS,
    PERMISSIONS.VIEW_ALL_USERS,
    PERMISSIONS.VIEW_PATIENT_RECORDS,
    PERMISSIONS.VIEW_PATIENT_APPOINTMENTS,
    PERMISSIONS.ADD_RESULTS,
  ],
  // Pharmacist - can view medicine inventory and dispense medicines
  pharmacist: [
    PERMISSIONS.VIEW_PHARMACY,
    PERMISSIONS.DISPENSE_MEDICINE,
    PERMISSIONS.VIEW_PHARMACY_SALES,
    PERMISSIONS.VIEW_PHARMACY_CUSTOMERS,
    PERMISSIONS.VIEW_ALL_USERS,
  ],
};

const fs = require('fs');
const path = require('path');
const USER_PERMISSIONS_FILE = path.join(__dirname, 'user_permissions.json');

// Load user overrides from JSON file (if present)
let USER_OVERRIDE_PERMISSIONS = {};
try {
  if (fs.existsSync(USER_PERMISSIONS_FILE)) {
    USER_OVERRIDE_PERMISSIONS = JSON.parse(fs.readFileSync(USER_PERMISSIONS_FILE, 'utf8')) || {};
  }
} catch (err) {
  console.error('Failed to load user override permissions:', err);
  USER_OVERRIDE_PERMISSIONS = {};
}

// Persist user overrides helper
const saveUserOverrides = () => {
  try {
    fs.writeFileSync(USER_PERMISSIONS_FILE, JSON.stringify(USER_OVERRIDE_PERMISSIONS, null, 2));
  } catch (err) {
    console.error('Failed to save user override permissions:', err);
  }
};

// Build the effective permission set for a user: role permissions + user overrides
const getEffectivePermissions = (role, userId) => {
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  const overrides = USER_OVERRIDE_PERMISSIONS[userId] || [];
  const combined = Array.from(new Set([...rolePerms, ...overrides]));
  return combined;
};

// to check specific permissions
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    
    console.log('\n=== PERMISSION CHECK ===');
    console.log('Endpoint:', req.method, req.path);
    console.log('Required permission:', requiredPermission);
    console.log('Session userId:', userId);
    console.log('Session userRole:', userRole);
    console.log('Session object keys:', Object.keys(req.session));
    
    if (!userId) {
      console.log('❌ No userId in session');
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const allowedPermissions = getEffectivePermissions(userRole, String(userId));
    console.log('Allowed permissions:', allowedPermissions);
    console.log('Has required permission?', allowedPermissions.includes(requiredPermission));

    if (!allowedPermissions.includes(requiredPermission)) {
      console.log('❌ Permission denied');
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to perform this action',
        code: 'PERMISSION_DENIED',
        required: requiredPermission
      });
    }

    console.log('✅ Permission granted');
    next();
  };
};

// Middleware to check multiple permissions (any one is sufficient)
const checkAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const userRole = req.session.userRole;
    const userId = String(req.session.userId);
    const allowedPermissions = getEffectivePermissions(userRole, userId);

    const hasPermission = permissions.some(p => allowedPermissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to perform this action',
        code: 'PERMISSION_DENIED'
      });
    }

    next();
  };
};

// Middleware to check all permissions (all must be present)
const checkAllPermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const userRole = req.session.userRole;
    const userId = String(req.session.userId);
    const allowedPermissions = getEffectivePermissions(userRole, userId);

    const hasAllPermissions = permissions.every(p => allowedPermissions.includes(p));

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to perform this action',
        code: 'PERMISSION_DENIED'
      });
    }

    next();
  };
};

// Get all permissions for a specific role
const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || [];
};

// Check if user has specific permission for a role (without overrides)
const hasPermission = (role, permission) => {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
};

// User override helpers
const getUserPermissions = (userId) => {
  return USER_OVERRIDE_PERMISSIONS[String(userId)] || [];
};

const setUserPermissions = (userId, permissionsArray) => {
  USER_OVERRIDE_PERMISSIONS[String(userId)] = Array.from(new Set(permissionsArray || []));
  saveUserOverrides();
};

const clearUserPermissions = (userId) => {
  delete USER_OVERRIDE_PERMISSIONS[String(userId)];
  saveUserOverrides();
};

// Patient feature routes mapping
const PATIENT_FEATURES = {
  viewDoctors: {
    permission: PERMISSIONS.VIEW_DOCTORS,
    description: 'View list of doctors',
    endpoint: '/api/doctors',
    method: 'GET'
  },
  bookAppointment: {
    permission: PERMISSIONS.BOOK_APPOINTMENT,
    description: 'Book a new appointment',
    endpoint: '/api/appointments',
    method: 'POST'
  },
  messageDoctor: {
    permission: PERMISSIONS.MESSAGE_DOCTOR,
    description: 'Send message to doctor',
    endpoint: '/api/messages',
    method: 'POST'
  },
  viewResults: {
    permission: PERMISSIONS.VIEW_RESULTS,
    description: 'View test results',
    endpoint: '/api/results',
    method: 'GET'
  },
  viewNextAppointment: {
    permission: PERMISSIONS.VIEW_NEXT_APPOINTMENT,
    description: 'View next appointment',
    endpoint: '/api/appointments/next',
    method: 'GET'
  },
  viewHealthSummary: {
    permission: PERMISSIONS.VIEW_HEALTH_SUMMARY,
    description: 'View health summary',
    endpoint: '/api/health-summary',
    method: 'GET'
  },
  viewMedication: {
    permission: PERMISSIONS.VIEW_MEDICATIONS,
    description: 'View prescriptions',
    endpoint: '/api/medications',
    method: 'GET'
  }
};

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  PATIENT_FEATURES,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  getRolePermissions,
  hasPermission,
  // user override API
  getUserPermissions,
  setUserPermissions,
  clearUserPermissions,
  getEffectivePermissions
};

