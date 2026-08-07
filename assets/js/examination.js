// Examination JavaScript - Doctor Dashboard

// Current examination data
var currentExamination = null;
var prescriptions = [];
var testReferrals = []; // Array to store multiple test referrals
var selectedAppointment = null;

// Initialize examination functionality
document.addEventListener('DOMContentLoaded', function() {
  initDatePicker();
  initTestReferralCheckbox();
  initVitalSignsCalculations();
  initFileUpload();
  initRoundChecks();
});

function initRoundChecks() {
  var checkbox = document.getElementById('roundCheckEnable');
  if (!checkbox) return;
  
  checkbox.addEventListener('change', function() {
    var section = document.getElementById('roundCheckSection');
    if (section) {
      section.classList.toggle('show', this.checked);
    }
  });
}

// Initialize date picker in Schedule tab
function initDatePicker() {
  var datePicker = document.getElementById('scheduleDatePicker');
  if (datePicker) {
    datePicker.addEventListener('change', handleDateChange);
    var today = new Date().toISOString().split('T')[0];
    datePicker.value = today;
    loadAppointmentsForDate(today);
  }
}

// Handle date picker change
async function handleDateChange(e) {
  var selectedDate = e.target.value;
  if (selectedDate) {
    await loadAppointmentsForDate(selectedDate);
    updateAppointmentLimitIndicator(selectedDate);
  }
}

// Load appointments for selected date
async function loadAppointmentsForDate(date) {
  try {
    var response = await fetch(API_BASE + '/doctor/appointments?date=' + date, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      var data = await response.json();
      if (data.success) {
        renderAppointmentsForDate(data.appointments);
      }
    }
  } catch (error) {
    console.error('Error loading appointments for date:', error);
  }
}

// Render appointments for selected date
function renderAppointmentsForDate(appointments) {
  var scheduleList = document.querySelector('#schedule .appointment-list');
  
  if (!scheduleList) return;
  
  if (!appointments || appointments.length === 0) {
    scheduleList.innerHTML = '<div class="appointment-item"><div class="appointment-info"><p class="patient-name">No appointments</p><span class="appointment-time">No appointments scheduled for this date</span></div></div>';
    return;
  }
  
  // Render appointments with Examination button
  var html = '';
  appointments.forEach(function(apt) {
    var appointmentTime = apt.appointment_time || apt.time;
    var patientName = apt.patient_name || 'Patient';
    var statusClass = getBadgeClass(apt.status);
    var statusText = capitalizeFirst(apt.status);
    var duration = apt.duration || 30;
    var id = apt.id;
    var patientId = apt.patient_id;
    
    html += '<div class="appointment-item">';
    html += '<div class="appointment-info">';
    html += '<p class="patient-name">' + patientName + '</p>';
    html += '<span class="appointment-time">' + formatTime(appointmentTime) + ' - ' + duration + ' min</span>';
    html += '</div>';
    html += '<div class="appointment-actions">';
    html += '<span class="appointment-badge ' + statusClass + '">' + statusText + '</span>';
    html += '<button class="view-btn" onclick="viewAppointment(' + id + ')">View</button>';
    html += '<button class="exam-btn" onclick="openExamination(' + id + ', \'' + patientName.replace(/'/g, "\\'") + '\', ' + patientId + ')">Examination</button>';
    html += '</div>';
    html += '</div>';
  });
  
  scheduleList.innerHTML = html;
}

// Update appointment limit indicator (max 5 per day)
function updateAppointmentLimitIndicator(date) {
  var indicator = document.getElementById('appointmentLimitIndicator');
  if (!indicator) return;
  
  fetch(API_BASE + '/doctor/appointments/count?date=' + date, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    var count = data.count || 0;
    var maxCount = 5;
    
    indicator.className = 'appointment-limit-indicator';
    if (count < maxCount) {
      indicator.classList.add('green');
      indicator.innerHTML = '<i class="fas fa-check-circle"></i> ' + count + '/' + maxCount + ' appointments';
    } else if (count === maxCount) {
      indicator.classList.add('yellow');
      indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + count + '/' + maxCount + ' appointments (Full)';
    } else {
      indicator.classList.add('red');
      indicator.innerHTML = '<i class="fas fa-times-circle"></i> ' + count + '/' + maxCount + ' appointments (Over limit)';
    }
  })
  .catch(function(err) { console.error('Error fetching appointment count:', err); });
}

// Initialize test referral checkbox
function initTestReferralCheckbox() {
  var checkbox = document.getElementById('isTestReferral');
  var options = document.getElementById('testReferralOptions');
  
  if (checkbox && options) {
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        options.classList.add('show');
      } else {
        options.classList.remove('show');
      }
    });
  }
}

// Initialize vital signs calculations (BMI)
function initVitalSignsCalculations() {
  var weightInput = document.getElementById('vitalWeight');
  var heightInput = document.getElementById('vitalHeight');
  
  if (weightInput && heightInput) {
    weightInput.addEventListener('input', calculateBMI);
    heightInput.addEventListener('input', calculateBMI);
  }
}

// Calculate BMI
function calculateBMI() {
  var weight = parseFloat(document.getElementById('vitalWeight').value);
  var height = parseFloat(document.getElementById('vitalHeight').value);
  var bmiInput = document.getElementById('vitalBmi');
  
  if (weight && height && weight > 0 && height > 0) {
    var heightM = height / 100;
    var bmi = (weight / (heightM * heightM)).toFixed(1);
    bmiInput.value = bmi;
  } else {
    bmiInput.value = '';
  }
}

// Open examination modal
async function openExamination(appointmentId, patientName, patientId, hasVitals) {
  selectedAppointment = { id: appointmentId, patientName: patientName, patientId: patientId, hasPreRecordedVitals: hasVitals };

  document.getElementById('examPatientId').value = patientId;
  document.getElementById('examAppointmentId').value = appointmentId;
  document.getElementById('examPatientName').textContent = patientName;
  document.getElementById('examPatientAvatar').textContent = getInitials(patientName);
  document.getElementById('examPatientDetails').textContent = 'Loading patient details...';

  resetExaminationForm();
  await loadExaminationData(appointmentId, hasVitals);

  var modal = document.getElementById('examinationModal');
  modal.classList.add('active');
 }

// Load existing examination data
 async function loadExaminationData(appointmentId, hasVitals) {
   try {
     var url = API_BASE + '/doctor/appointments/' + appointmentId + '/examination';
     var response = await fetch(url, {
       credentials: 'include',
       headers: { 'Content-Type': 'application/json' }
     });

     if (response.ok) {
       var data = await response.json();
       if (data.success && data.examination) {
         populateExaminationForm(data.examination);
       } else if (data.appointmentInfo) {
         var age = data.appointmentInfo.age || '--';
         var bloodType = data.appointmentInfo.blood_type || '--';
         document.getElementById('examPatientDetails').textContent = 'Age: ' + age + ' - Blood Type: ' + bloodType;
       }

       // Show staff vitals banner if available
       if (hasVitals && data.staffVitals) {
         showStaffVitalsBanner(data.staffVitals);
         populateStaffVitalsInForm(data.staffVitals);
       }
     }
   } catch (error) {
     console.error('Error loading examination data:', error);
   }
  }

// Show staff-recorded vitals banner above the examination form
 function showStaffVitalsBanner(vitals) {
   var banner = document.getElementById('staffVitalsBanner');
   if (!banner) return;

   var bp = (vitals.bpSystolic || '--') + '/' + (vitals.bpDiastolic || '--');
   var hr = vitals.heartRate || '--';
   var temp = vitals.temperature || '--';
   var spo2 = vitals.spo2 || '--';
   var rr = vitals.respiratoryRate || vitals.respiratory || '--';
   var glucose = vitals.glucose || '--';
   var weight = vitals.weight || '--';
   var bmi = vitals.bmi || '--';
   var recordedAt = vitals.recordedAt ? new Date(vitals.recordedAt).toLocaleString('en-GB') : '';

   banner.innerHTML = `
     <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; margin-bottom: 16px;">
       <div style="flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-size: 16px;">
         <i class="fas fa-heartbeat"></i>
       </div>
       <div style="flex: 1;">
         <div style="font-weight: 600; color: #1e40af; font-size: 14px; margin-bottom: 4px;">Pre-Examination Vitals (Recorded by Staff)</div>
         <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 13px; color: #1e3a8a;">
           <div><strong>BP:</strong> ${bp} mmHg</div>
           <div><strong>HR:</strong> ${hr} bpm</div>
           <div><strong>Temp:</strong> ${temp}°C</div>
           <div><strong>SpO2:</strong> ${spo2}%</div>
           <div><strong>RR:</strong> ${rr}/min</div>
           <div><strong>Glucose:</strong> ${glucose} mg/dL</div>
           <div><strong>Weight:</strong> ${weight} kg</div>
           <div><strong>BMI:</strong> ${bmi}</div>
           ${recordedAt ? '<div><strong>At:</strong> ' + recordedAt + '</div>' : ''}
         </div>
         ${vitals.notes ? '<div style="margin-top: 6px; font-size: 12px; color: #1e3a8a;"><strong>Notes:</strong> ' + vitals.notes + '</div>' : ''}
       </div>
       <button type="button" onclick="document.getElementById('staffVitalsBanner').style.display='none'" style="background: none; border: none; color: #2563eb; cursor: pointer; font-size: 18px; padding: 4px 8px;">✕</button>
     </div>
 `;
   banner.style.display = 'block';
 }

 // Populate staff vitals in the examination form (read-only)
 function populateStaffVitalsInForm(vitals) {
   var vitalInputs = ['vitalBpSystolic', 'vitalBpDiastolic', 'vitalHeartRate', 'vitalTemperature', 'vitalRespiratory', 'vitalSpo2', 'vitalGlucose', 'vitalWeight', 'vitalHeight', 'vitalBmi'];
   
   vitalInputs.forEach(function(id) {
     var el = document.getElementById(id);
     if (el) {
       el.readOnly = true;
       el.style.backgroundColor = '#f1f5f9';
     }
   });
   
   document.getElementById('vitalBpSystolic').value = vitals.bpSystolic || '';
   document.getElementById('vitalBpDiastolic').value = vitals.bpDiastolic || '';
   document.getElementById('vitalHeartRate').value = vitals.heartRate || '';
   document.getElementById('vitalTemperature').value = vitals.temperature || '';
   document.getElementById('vitalRespiratory').value = vitals.respiratoryRate || vitals.respiratory || '';
   document.getElementById('vitalSpo2').value = vitals.spo2 || '';
   document.getElementById('vitalGlucose').value = vitals.glucose || '';
   document.getElementById('vitalWeight').value = vitals.weight || '';
   document.getElementById('vitalHeight').value = vitals.height || '';
   document.getElementById('vitalBmi').value = vitals.bmi || '';
 }

 // Populate examination form with existing data
function populateExaminationForm(exam) {
  currentExamination = exam;
  
if (exam.vitalSigns) {
     document.getElementById('vitalBpSystolic').value = exam.vitalSigns.bpSystolic || '';
     document.getElementById('vitalBpDiastolic').value = exam.vitalSigns.bpDiastolic || '';
     document.getElementById('vitalHeartRate').value = exam.vitalSigns.heartRate || '';
     document.getElementById('vitalTemperature').value = exam.vitalSigns.temperature || '';
     document.getElementById('vitalRespiratory').value = exam.vitalSigns.respiratory || '';
     document.getElementById('vitalSpo2').value = exam.vitalSigns.spo2 || '';
     document.getElementById('vitalGlucose').value = exam.vitalSigns.glucose || '';
     document.getElementById('vitalWeight').value = exam.vitalSigns.weight || '';
     document.getElementById('vitalHeight').value = exam.vitalSigns.height || '';
     document.getElementById('vitalBmi').value = exam.vitalSigns.bmi || '';
   }
  
  document.getElementById('chiefComplaint').value = exam.chiefComplaint || '';
  document.getElementById('examinationNotes').value = exam.examinationNotes || '';
  document.getElementById('findings').value = exam.findings || '';
  document.getElementById('diagnosis').value = exam.diagnosis || '';
  document.getElementById('treatmentPlan').value = exam.treatmentPlan || '';
  document.getElementById('recommendations').value = exam.recommendations || '';
  document.getElementById('nextVisitDate').value = exam.nextVisitDate || '';
  document.getElementById('followUpRequired').value = exam.followUpRequired || 'no';
  
  if (exam.prescriptions) {
    prescriptions = exam.prescriptions;
    renderPrescriptions();
  }
}

// Reset examination form
function resetExaminationForm() {
  const patientIdInput = document.getElementById('examPatientId');
  const appointmentIdInput = document.getElementById('examAppointmentId');
  const savedPatientId = patientIdInput ? patientIdInput.value : '';
  const savedAppointmentId = appointmentIdInput ? appointmentIdInput.value : '';

  document.getElementById('examinationForm').reset();

  if (patientIdInput) patientIdInput.value = savedPatientId;
  if (appointmentIdInput) appointmentIdInput.value = savedAppointmentId;

  prescriptions = [];
  testReferrals = []; // Reset test referrals
  renderPrescriptions();
  renderTestReferrals();
  currentExamination = null;
}

// Close examination modal
function closeExaminationModal() {
  var modal = document.getElementById('examinationModal');
  if (modal) modal.classList.remove('active');
  selectedAppointment = null;
  window._examinationMode = false;
}

// Save examination (saves as pending first, shows disposition modal)
async function saveExamination() {
  if (!selectedAppointment) {
    alert('No patient selected');
    return;
  }
  
  var diagnosis = document.getElementById('diagnosis').value;
  if (!diagnosis) {
    alert('Please enter a diagnosis');
    return;
  }
  
var vitalSigns = {
    bpSystolic: document.getElementById('vitalBpSystolic').value,
    bpDiastolic: document.getElementById('vitalBpDiastolic').value,
    heartRate: document.getElementById('vitalHeartRate').value,
    temperature: document.getElementById('vitalTemperature').value,
    respiratory: document.getElementById('vitalRespiratory').value,
    spo2: document.getElementById('vitalSpo2').value,
    glucose: document.getElementById('vitalGlucose').value,
    weight: document.getElementById('vitalWeight').value,
    height: document.getElementById('vitalHeight').value,
    bmi: document.getElementById('vitalBmi').value
  };

  var examinationData = {
    appointment_id: selectedAppointment.id,
    patient_id: selectedAppointment.patientId,
    examination_date: new Date().toISOString().split('T')[0],
    vital_signs: vitalSigns,
    chief_complaint: document.getElementById('chiefComplaint').value,
    examination_notes: document.getElementById('examinationNotes').value,
    findings: document.getElementById('findings').value,
    diagnosis: diagnosis,
    treatment_plan: document.getElementById('treatmentPlan').value,
    status: 'pending'
  };

  // Store examination data for later submission
  window._pendingExaminationData = examinationData;
  window._pendingPrescriptions = prescriptions;
  window._pendingTestReferrals = testReferrals;

  // Show disposition modal
  var modal = document.getElementById('dispositionModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  } else {
    // Fallback if modal not yet added - save directly
    await submitExamination();
  }
}

// Submit saved examination to backend
async function submitExamination() {
  if (!window._pendingExaminationData) return;
  
  var examinationData = window._pendingExaminationData;
  var prescriptions = window._pendingPrescriptions || [];
  var testReferrals = window._pendingTestReferrals || [];
  
  try {
    var response = await fetch(API_BASE + '/doctor/examinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(examinationData)
    });
    
    var result = await response.json();
    
    if (result.success) {
      var examinationId = result.examinationId;
      
      // Save prescriptions if any
      if (prescriptions && prescriptions.length > 0) {
        for (var i = 0; i < prescriptions.length; i++) {
          var pres = prescriptions[i];
          await savePrescriptionMedication(selectedAppointment.patientId, selectedAppointment.id, pres);
        }
      }
      
      // Create medical report entry
      var reportData = {
        patient_id: selectedAppointment.patientId,
        report_type: 'medical',
        report_title: 'Examination Report - ' + new Date().toLocaleDateString(),
        report_description: 'Chief Complaint: ' + (document.getElementById('chiefComplaint').value || 'N/A') + '\nDiagnosis: ' + examinationData.diagnosis + '\nTreatment Plan: ' + (document.getElementById('treatmentPlan').value || 'N/A'),
        visibility: 'patient',
        status: 'submitted'
      };
      
      var reportResponse = await fetch(API_BASE + '/doctor/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(reportData)
      });
      
      var reportResult = await reportResponse.json();
      if (reportResult.success) {
        console.log('Medical report created for patient');
      }
      
      // Save test referrals
      if (testReferrals && testReferrals.length > 0) {
        for (var j = 0; j < testReferrals.length; j++) {
          var ref = testReferrals[j];
          var referralData = {
            patient_id: selectedAppointment.patientId,
            appointment_id: selectedAppointment.id,
            report_type: ref.testType,
            report_title: ref.testName,
            report_description: ref.notes || 'Test referral from examination',
            is_test_referral: true,
            test_referred_to: ref.referredTo,
            urgency: ref.urgency || 'routine',
            visibility: 'staff',
            status: 'submitted'
          };
          
          var referralResponse = await fetch(API_BASE + '/doctor/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(referralData)
          });
          
          var referralResult = await referralResponse.json();
          if (referralResult.success) {
            console.log('Test referral created:', ref.testName);
          }
        }
      }
      
      alert('Examination saved successfully!');
      closeExaminationModal();
      closeDispositionModal();
      window._pendingExaminationData = null;
      if (typeof loadTodayAppointments === 'function') {
        loadTodayAppointments();
      }
       if (typeof loadAppointmentsForDate === 'function' && document.getElementById('scheduleDatePicker')?.value) {
         loadAppointmentsForDate(document.getElementById('scheduleDatePicker').value);
       }
       if (document.getElementById('patientProfileModal')?.style.display === 'flex') {
         viewPatientProfile(selectedAppointment.patientId);
       }
     } else {
      alert('Failed to save examination: ' + result.message);
    }
  } catch (error) {
    console.error('Error saving examination:', error);
    alert('Error saving examination. Please try again.');
  }
}

// Disposition Modal functions
function closeDispositionModal() {
  var modal = document.getElementById('dispositionModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
  window._pendingExaminationData = null;
  window._pendingPrescriptions = [];
  window._pendingTestReferrals = [];
  prescriptions = [];
  testReferrals = [];
  renderPrescriptions();
  renderTestReferrals();
  currentExamination = null;
}

function chooseOutpatient() {
  // Save examination as outpatient (status: completed)
  if (window._pendingExaminationData) {
    window._pendingExaminationData.status = 'completed';
  }
  submitExamination();
}

async function chooseAdmitPatient() {
  // Open admission modal, passing saved examination data
  if (window._pendingExaminationData) {
    window._pendingExaminationData.status = 'completed';
  }

  var modal = document.getElementById('admissionModal');
  var dispositionModal = document.getElementById('dispositionModal');
  if (dispositionModal) {
    dispositionModal.style.display = 'none';
    dispositionModal.classList.remove('active');
  }

  if (modal) {
    document.getElementById('admissionPatientName').textContent = selectedAppointment.patientName;
    document.getElementById('admissionPatientId').value = selectedAppointment.patientId;
    document.getElementById('admissionAppointmentId').value = selectedAppointment.id;

    if (window._pendingExaminationData) {
      document.getElementById('admissionDiagnosis').value = window._pendingExaminationData.diagnosis || '';
    }

    document.getElementById('admissionForm').reset();
    document.getElementById('admissionDate').value = new Date().toISOString().split('T')[0];

    modal.style.display = 'flex';
  } else {
    alert('Admission form not available');
  }
}

// Finalize admission and examination
async function finalizeAdmission() {
  var admissionData = {
    patient_id: parseInt(document.getElementById('admissionPatientId').value),
    appointment_id: parseInt(document.getElementById('admissionAppointmentId').value),
    room_number: document.getElementById('admissionRoom').value,
    bed_number: document.getElementById('admissionBed').value,
    admission_type: document.getElementById('admissionType').value,
    reason_for_admission: document.getElementById('admissionReason').value,
    admitting_diagnosis: document.getElementById('admissionDiagnosis').value,
    notes: document.getElementById('admissionNotes').value
  };

  try {
    var response = await fetch(API_BASE + '/doctor/admissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(admissionData)
    });

    var result = await response.json();

    if (result.success) {
      alert('Patient admitted successfully!');
      document.getElementById('admissionModal').style.display = 'none';

      // Now save the examination too
      await submitExamination();
      closeDispositionModal();

      if (typeof loadTodayAppointments === 'function') {
        loadTodayAppointments();
      }
      if (document.getElementById('patientProfileModal')?.style.display === 'flex') {
        viewPatientProfile(parseInt(document.getElementById('admissionPatientId').value));
      }
    } else {
      alert('Failed to admit patient: ' + result.message);
    }
  } catch (error) {
    console.error('Error admitting patient:', error);
    alert('Error admitting patient. Please try again.');
  }
}

// Save prescription medication
async function savePrescriptionMedication(patientId, appointmentId, prescription) {
  try {
    var response = await fetch(API_BASE + '/doctor/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        patient_id: patientId,
        appointment_id: appointmentId,
        medication_name: prescription.name,
        dosage: prescription.dosage,
        frequency: prescription.frequency,
        duration: prescription.duration,
        instructions: prescription.instructions,
        refills_remaining: prescription.refills
      })
    });
    
    var result = await response.json();
    if (result.success) {
      console.log('Prescription saved:', prescription.name);
    } else {
      console.error('Failed to save prescription:', result.message);
    }
  } catch (error) {
    console.error('Error saving prescription:', error);
  }
}

// Add prescription
function examAddPrescription() {
  window._examinationMode = true;
  var patientIdInput = document.getElementById('examPatientId');
  var prescriptionPatientSelect = document.getElementById('prescriptionPatientId');
  
  if (!patientIdInput || !patientIdInput.value) {
    alert('Please select a patient first');
    return;
  }

  document.getElementById('prescriptionIndex').value = -1;
  document.getElementById('prescriptionId').value = '';
  document.getElementById('prescriptionForm').reset();
  document.getElementById('prescriptionModalTitle').textContent = 'Add Medication';

  if (prescriptionPatientSelect) {
    var needsPatients = prescriptionPatientSelect.options.length <= 1;
    if (needsPatients) {
      loadPatientsForPrescription();
    }

    var attemptSetPatient = function() {
      prescriptionPatientSelect.value = patientIdInput.value;
      var modal = document.getElementById('prescriptionModal');
      if (modal) modal.style.display = 'flex';
    };

    if (needsPatients) {
      setTimeout(attemptSetPatient, 500);
    } else {
      attemptSetPatient();
    }
  }
}

function examOpenPrescriptionModalForCurrentPatient() {
  var patientFilter = document.getElementById('prescriptionPatientFilter');
  var patientId = patientFilter ? patientFilter.value : '';
  
  if (!patientId) {
    alert('Please select a patient first');
    return;
  }
  
  var prescriptionPatientSelect = document.getElementById('prescriptionPatientId');
  if (prescriptionPatientSelect && prescriptionPatientSelect.options.length <= 1) {
    loadPatientsForPrescription();
  }
  
  setTimeout(function() {
    document.getElementById('prescriptionPatientId').value = patientId;
    examAddPrescription();
  }, prescriptionPatientSelect && prescriptionPatientSelect.options.length <= 1 ? 500 : 0);
}

function loadPatientsForPrescription() {
  fetch(API_BASE + '/doctor/patients?status=all', {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      var patientSelect = document.getElementById('prescriptionPatientId');
      var patientFilter = document.getElementById('prescriptionPatientFilter');
      
      var options = '<option value="">Select Patient</option>';
      data.patients.forEach(function(p) {
        options += '<option value="' + p.id + '">' + p.name + ' (' + (p.status === 'admitted' ? 'Admitted' : 'Non-Admitted') + ')</option>';
      });
      
      if (patientSelect) patientSelect.innerHTML = options;
      if (patientFilter) {
        var filterOptions = '<option value="">All Patients</option>';
        data.patients.forEach(function(p) {
          filterOptions += '<option value="' + p.id + '">' + p.name + '</option>';
        });
        patientFilter.innerHTML = filterOptions;
      }
    }
  })
  .catch(function(err) { 
    console.error('Error loading patients for prescription:', err);
  });
}

// Edit prescription
function editPrescription(prescriptionId) {
  var isLocal = false;
  var index = -1;
  var prescription = null;

  if (typeof prescriptionId === 'number' || (typeof prescriptionId === 'string' && prescriptionId.match(/^\d+$/))) {
    index = parseInt(prescriptionId, 10);
    prescription = prescriptions[index];
    if (prescription) {
      isLocal = true;
    }
  }

  if (isLocal) {
    window._examinationMode = true;
    document.getElementById('prescriptionIndex').value = index;
    document.getElementById('prescriptionId').value = '';
    document.getElementById('prescriptionPatientId').value = prescription.patient_id || '';
    document.getElementById('medicationName').value = prescription.name || '';
    document.getElementById('medicationDosage').value = prescription.dosage || '';
    document.getElementById('medicationFrequency').value = prescription.frequency || '';
    document.getElementById('medicationDuration').value = prescription.duration || '';
    document.getElementById('medicationRefills').value = prescription.refills || 0;
    document.getElementById('medicationInstructions').value = prescription.instructions || '';
    document.getElementById('prescriptionModalTitle').textContent = 'Edit Medication';

    var modal = document.getElementById('prescriptionModal');
    if (modal) modal.style.display = 'flex';
    return;
  }

  window._examinationMode = false;
  fetch(API_BASE + '/doctor/medications/' + prescriptionId, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success && data.medication) {
      var med = data.medication;
      document.getElementById('prescriptionId').value = med.id;
      document.getElementById('prescriptionPatientId').value = med.patient?.id || '';
      document.getElementById('medicationName').value = med.medicationName || '';
      document.getElementById('medicationDosage').value = med.dosage || '';
      document.getElementById('medicationFrequency').value = med.frequency || '';
      document.getElementById('medicationDuration').value = med.duration || '';
      document.getElementById('medicationRefills').value = med.refillsRemaining || 0;
      document.getElementById('medicationInstructions').value = med.instructions || '';
      document.getElementById('prescriptionModalTitle').textContent = 'Edit Medication';

      var modal = document.getElementById('prescriptionModal');
      if (modal) modal.style.display = 'flex';
    }
  })
  .catch(function(err) { console.error('Error loading prescription for edit:', err); });
}

// Save prescription from modal
function savePrescription() {
  var patientId = document.getElementById('prescriptionPatientId').value;
  var name = document.getElementById('medicationName').value.trim();
  var dosage = document.getElementById('medicationDosage').value.trim();
  var frequency = document.getElementById('medicationFrequency').value;
  
  if (!patientId) {
    alert('Please select a patient');
    return;
  }
  if (!name || !dosage || !frequency) {
    alert('Please fill in medication name, dosage, and frequency');
    return;
  }
  
  var prescriptionData = {
    patient_id: parseInt(patientId),
    name: name,
    dosage: dosage,
    frequency: frequency,
    duration: document.getElementById('medicationDuration').value.trim(),
    refills: parseInt(document.getElementById('medicationRefills').value) || 0,
    instructions: document.getElementById('medicationInstructions').value.trim()
  };
  
  if (window._examinationMode) {
    var prescriptionId = document.getElementById('prescriptionId').value;
    var prescriptionIndex = parseInt(document.getElementById('prescriptionIndex').value);
    
    if (prescriptionId && prescriptionIndex >= 0 && prescriptions[prescriptionIndex]) {
      prescriptions[prescriptionIndex] = prescriptionData;
    } else if (prescriptionId) {
      var foundIndex = -1;
      for (var i = 0; i < prescriptions.length; i++) {
        if (prescriptions[i] && prescriptions[i].id == prescriptionId) {
          foundIndex = i;
          break;
        }
      }
      if (foundIndex >= 0) {
        prescriptions[foundIndex] = prescriptionData;
      } else {
        prescriptions.push(prescriptionData);
      }
    } else {
      prescriptions.push(prescriptionData);
    }
    
    renderPrescriptions();
    examClosePrescriptionModal();
    alert('Prescription added to examination');
    return;
  }
  
  var prescriptionId = document.getElementById('prescriptionId').value;
  var url = API_BASE + '/doctor/medications';
  var method = 'POST';
  
  if (prescriptionId) {
    url = API_BASE + '/doctor/medications/' + prescriptionId;
    method = 'PUT';
  }
  
  fetch(url, {
    method: method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patient_id: parseInt(patientId),
      medication_name: name,
      dosage: dosage,
      frequency: frequency,
      duration: document.getElementById('medicationDuration').value.trim(),
      refills_remaining: parseInt(document.getElementById('medicationRefills').value) || 0,
      instructions: document.getElementById('medicationInstructions').value.trim()
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert(prescriptionId ? 'Prescription updated successfully' : 'Prescription created successfully');
      examClosePrescriptionModal();
      loadPrescriptions();
      if (typeof loadPatientPrescriptions === 'function') loadPatientPrescriptions();
      if (typeof loadDoctorRoundChecks === 'function') loadDoctorRoundChecks();
    } else {
      alert('Failed to save prescription: ' + data.message);
    }
  })
  .catch(function(err) { 
    console.error('Error saving prescription:', err);
    alert('Error saving prescription');
  });
}

// Remove prescription
function removePrescription(index) {
  if (confirm('Remove this medication?')) {
    prescriptions.splice(index, 1);
    renderPrescriptions();
  }
}

// Render prescriptions list
function renderPrescriptions() {
  var container = document.getElementById('prescriptionList');
  if (!container) return;
  
  if (prescriptions.length === 0) {
    container.innerHTML = '<p style="color: #94a3b8; font-size: 13px; text-align: center;">No medications added yet</p>';
    return;
  }
  
  var html = '';
  prescriptions.forEach(function(pres, index) {
    var freqLabel = getFrequencyLabel(pres.frequency);
    var duration = pres.duration || 'As directed';
    
    html += '<div class="prescription-item">';
    html += '<div class="prescription-item-info">';
    html += '<div class="drug-name">' + pres.name + ' ' + pres.dosage + '</div>';
    html += '<div class="drug-details">' + freqLabel + ' - ' + duration + '</div>';
    if (pres.instructions) {
      html += '<div class="drug-instructions">' + pres.instructions + '</div>';
    }
    if (pres.refills > 0) {
      html += '<div class="drug-instructions">Refills remaining: ' + pres.refills + '</div>';
    }
    html += '</div>';
    html += '<button type="button" class="prescription-remove-btn" onclick="editPrescription(' + index + ')" title="Edit"><i class="fas fa-edit"></i></button>';
    html += '<button type="button" class="prescription-remove-btn" onclick="removePrescription(' + index + ')" title="Remove"><i class="fas fa-times"></i></button>';
    html += '</div>';
  });
  
  container.innerHTML = html;
}

// Get frequency label
function getFrequencyLabel(frequency) {
  var labels = {
    'once_daily': 'Once Daily',
    'twice_daily': 'Twice Daily',
    'three_times_daily': '3x Daily',
    'four_times_daily': '4x Daily',
    'as_needed': 'As Needed',
    'at_night': 'At Night',
    'before_meals': 'Before Meals',
    'after_meals': 'After Meals'
  };
  return labels[frequency] || frequency;
}

// Close prescription modal
function examClosePrescriptionModal() {
  var modal = document.getElementById('prescriptionModal');
  if (modal) modal.style.display = 'none';
  
  setTimeout(function() {
    document.getElementById('prescriptionForm').reset();
    document.getElementById('prescriptionId').value = '';
    document.getElementById('prescriptionIndex').value = '-1';
  }, 300);
}

// ================== TEST REFERRALS FUNCTIONS ==================

// Open test referral modal
function addTestReferral() {
  document.getElementById('testReferralIndex').value = -1;
  document.getElementById('testReferralForm').reset();
  document.getElementById('testReferralModalTitle').textContent = 'Add Test';
  
  var modal = document.getElementById('testReferralModal');
  modal.classList.add('active');
}

// Edit test referral
function editTestReferral(index) {
  var ref = testReferrals[index];
  if (!ref) return;
  
  document.getElementById('testReferralIndex').value = index;
  document.getElementById('testReferralModalTitle').textContent = 'Edit Test';
  document.getElementById('testType').value = ref.testType || '';
  document.getElementById('testName').value = ref.testName || '';
  document.getElementById('testNotes').value = ref.notes || '';
  document.getElementById('testUrgency').value = ref.urgency || 'routine';
  document.getElementById('testReferredTo').value = ref.referredTo || 'lab';
  
  var modal = document.getElementById('testReferralModal');
  modal.classList.add('active');
}

// Save test referral from modal
function saveTestReferral() {
  var testType = document.getElementById('testType').value;
  var testName = document.getElementById('testName').value;
  var notes = document.getElementById('testNotes').value;
  var urgency = document.getElementById('testUrgency').value;
  var referredTo = document.getElementById('testReferredTo').value;
  
  if (!testType || !testName) {
    alert('Please select test type and enter test name');
    return;
  }
  
  var index = parseInt(document.getElementById('testReferralIndex').value);
  var referral = {
    testType: testType,
    testName: testName,
    notes: notes,
    urgency: urgency,
    referredTo: referredTo
  };
  
  if (index >= 0) {
    testReferrals[index] = referral;
  } else {
    testReferrals.push(referral);
  }
  
  renderTestReferrals();
  closeTestReferralModal();
}

// Remove test referral
function removeTestReferral(index) {
  if (confirm('Remove this test?')) {
    testReferrals.splice(index, 1);
    renderTestReferrals();
  }
}

// Render test referrals list
function renderTestReferrals() {
  var container = document.getElementById('testReferralList');
  if (!container) return;
  
  if (testReferrals.length === 0) {
    container.innerHTML = '<p style="color: #94a3b8; font-size: 13px; text-align: center;">No tests added yet</p>';
    return;
  }
  
  var html = '';
  testReferrals.forEach(function(ref, index) {
    var urgencyLabel = ref.urgency === 'emergency' ? 'Emergency' : ref.urgency === 'urgent' ? 'Urgent' : 'Routine';
    var urgencyClass = ref.urgency === 'emergency' ? '#dc2626' : ref.urgency === 'urgent' ? '#f59e0b' : '#64748b';
    var typeLabel = getTestTypeLabel(ref.testType);
    
    html += '<div class="prescription-item">';
    html += '<div class="prescription-item-info">';
    html += '<div class="drug-name">' + ref.testName + ' <span style="font-size: 12px; color: #64748b;">(' + typeLabel + ')</span></div>';
    html += '<div class="drug-instructions" style="color: ' + urgencyClass + ';">' + urgencyLabel + ' - Referred to: ' + ref.referredTo + '</div>';
    if (ref.notes) {
      html += '<div class="drug-instructions">Notes: ' + ref.notes + '</div>';
    }
    html += '</div>';
    html += '<button type="button" class="prescription-remove-btn" onclick="editTestReferral(' + index + ')" title="Edit"><i class="fas fa-edit"></i></button>';
    html += '<button type="button" class="prescription-remove-btn" onclick="removeTestReferral(' + index + ')" title="Remove"><i class="fas fa-times"></i></button>';
    html += '</div>';
  });
  
  container.innerHTML = html;
}

// Get test type label
function getTestTypeLabel(type) {
  var labels = {
    'blood': 'Blood Test',
    'urine': 'Urine Test',
    'stool': 'Stool Test',
    'xray': 'X-Ray',
    'ultrasound': 'Ultrasound Test',
    'ct': 'CT Scan Test',
    'mri': 'MRI Test',
    'ecg': 'ECG Test',
    'echo': 'Echocardiogram Test',
    'PSA': 'PSA Test',
    'B_HCG': 'B-HCG Test',
    'AFP': 'AFP Test',
    'TSH': 'TSH Test',
    'FT3': 'FT3 Test',
    'FT4': 'FT4 Test',
    'VITAMIN': 'VITAMIN Test',
    'CEA': 'CEA Test',
    'LH': 'LH Test',
    'FSH': 'FSH Test',
    'PROLACTIN': 'PROLACTIN Test',
    'E2': 'E2 Test',
    'PROGESTERONE': 'PROGESTERONE Test',
    'CRP': 'CRP Test',
    'HBA1C': 'HBA1C Test',
    'EUCR': 'EUCR Test',
    'ELECTROLYTE': 'ELECTROLYTE Test',
    'UREA': 'UREA Test',
    'CREATININE': 'CREATININE Test',
    'POTASSIUM': 'POTASSIUM Test',
    'CLORIDE': 'CLORIDE Test',
    'SODIUM': 'SODIUM Test',
    'BICARBONATE': 'BICARBONATE Test',
    'CALCIUM': 'CALCIUM Test',
    'PHOSPHATE': 'PHOSPHATE Test',
    'LIVER FUNCTION TEST(lFT)': 'LIVER FUNCTION TEST(lFT) Test',
    'AST': 'AST Test',
    'ALP': 'ALP Test',
    'ALT': 'ALT Test',
    'TOTAL BILIRUBIN': 'TOTAL BILIRUBIN Test',
    'DIRECT BILIRUBINTOTAL PROTEIN': 'DIRECT BILIRUBINTOTAL PROTEIN Test',
    'GGT_': 'GGT_ Test',
    'ALBUMIN': 'ALBUMIN Test',
    'ESR': 'ESR Test',
    'FASTING LIPID_ PROFILE(FLP)': 'FASTING LIPID_ PROFILE(FLP) Test',
    'TOTAL CHOLESTEROL': 'TOTAL CHOLESTEROL Test',
    'HDL': 'HDL Test',
    'LDL': 'LDL Test',
    'TRIGLYCERIDE': 'TRIGLYCERIDE Test',
    'URIC ACID': 'URIC ACID Test',
    'FASTING GLUCOSE TEST(FBS)': 'FASTING GLUCOSE TEST(FBS) Test',
    'RADOM GLUCOSE(RBS)': 'RADOM GLUCOSE(RBS) Test',
    '2HPP': '2HPP Test',
    'OGTT': 'OGTT Test',
    'INSULIN RANDOM': 'INSULIN RANDOM Test',
    'INSULIN FASTING': 'INSULIN FASTING Test',
    'VITAMIN B12': 'VITAMIN B12 Test',
    'VITAMIN D': 'VITAMIN D Test',
    'CA12.5': 'CA12.5 Test',
    'CA 15.3': 'CA 15.3 Test',
    'CA 19.9': 'CA 19.9 Test',
    'COOMBS TEST DIRECT': 'COOMBS TEST DIRECT Test',
    'COOMBS TEST INDIRCT': 'COOMBS TEST INDIRCT Test',
    'FULL BLOOD COUNT': 'FULL BLOOD COUNT Test',
    'PERIPHERAL BLOOD FILM': 'PERIPHERAL BLOOD FILM Test',
    'PvC_8500': 'PvC_8500 Test',
    'RETICULOCYTE COUNT': 'RETICULOCYTE COUNT Test',
    'G6PD QUANTITATIVE': 'G6PD QUANTITATIVE Test',
    'HAEMOGLOBIN': 'HAEMOGLOBIN Test',
    'HIV 1&2': 'HIV 1&2 Test',
    'HEPATITIS B': 'HEPATITIS B Test',
    'HEPATITIS C': 'HEPATITIS C Test',
    'HEPATITIS A': 'HEPATITIS A Test',
    'VDRL': 'VDRL Test',
    'HEPATITIS B VIRAL LOAD': 'HEPATITIS B VIRAL LOAD Test',
    'HEPATITIS CVIRAL LOAD_H_PYLORI SERUM': 'HEPATITIS CVIRAL LOAD_H_PYLORI SERUM Test',
    'TORCH PANEL (QUALITATIVE )': 'TORCH PANEL (QUALITATIVE ) Test',
    'TORCH PANEL (QUALITATIVE)': 'TORCH PANEL (QUALITATIVE) Test',
    'BLOOD CULTURE AEROBIC': 'BLOOD CULTURE AEROBIC Test',
    'BLOOD CULTURE ANAEROBIC': 'BLOOD CULTURE ANAEROBIC Test',
    'BLOOD GROUP': 'BLOOD GROUP Test',
    'GENOTYPE': 'GENOTYPE Test',
    'HB QUALIFICATION(HPLC)': 'HB QUALIFICATION(HPLC) Test',
    'URINALYSIS': 'URINALYSIS Test',
    'PREGNANCY TEST BLOOD': 'PREGNANCY TEST BLOOD Test',
    'MALARIA': 'MALARIA Test',
    'WIDAl': 'WIDAl Test',
    'ElECTROLYTE': 'ElECTROLYTE Test',
    'other': 'Other'
  };
  return labels[type] || type;
}

// Close test referral modal
function closeTestReferralModal() {
  var modal = document.getElementById('testReferralModal');
  modal.classList.remove('active');
}

// File upload handling
var selectedReportFile = null;

function initFileUpload() {
  var fileInput = document.getElementById('reportFile');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }
}

function handleFileSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  
  selectedReportFile = file;
  
  var container = document.getElementById('selectedFileContainer');
  if (container) {
    container.innerHTML = '<div class="selected-file"><div class="file-icon"><i class="fas fa-file"></i></div><div class="file-info"><div class="file-name">' + file.name + '</div><div class="file-size">' + formatFileSize(file.size) + '</div></div><button type="button" class="remove-file" onclick="removeSelectedFile()"><i class="fas fa-times"></i></button></div>';
  }
}

function removeSelectedFile() {
  selectedReportFile = null;
  var fileInput = document.getElementById('reportFile');
  if (fileInput) fileInput.value = '';
  
  var container = document.getElementById('selectedFileContainer');
  if (container) container.innerHTML = '';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  var k = 1024;
  var sizes = ['Bytes', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload report file
async function uploadReportFile(examinationId) {
  if (!selectedReportFile) return null;
  
  var formData = new FormData();
  formData.append('file', selectedReportFile);
  formData.append('examinationId', examinationId);
  formData.append('reportType', document.getElementById('reportType').value);
  formData.append('reportTitle', document.getElementById('reportTitle').value);
  
  try {
    var response = await fetch(API_BASE + '/doctor/reports/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    var result = await response.json();
    if (result.success) {
      return result.reportId;
    }
  } catch (error) {
    console.error('Error uploading report:', error);
  }
  
  return null;
}

// ===== NEW FUNCTIONS FOR TABS =====

// Examinations Tab Functions
function loadExaminations() {
  var searchInput = document.getElementById('examinationSearchInput');
  var dateFilter = document.getElementById('examinationDateFilter');
  var searchTerm = searchInput ? searchInput.value : '';
  var dateRange = dateFilter ? dateFilter.value : '';
  
  fetch(API_BASE + '/doctor/examinations?search=' + encodeURIComponent(searchTerm) + '&dateRange=' + dateRange, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      renderExaminationsList(data.examinations);
    } else {
      showExaminationsError();
    }
  })
  .catch(function(err) { 
    console.error('Error loading examinations:', err);
    showExaminationsError();
  });
}

function renderExaminationsList(examinations) {
  var container = document.getElementById('examinationsList');
  if (!container) return;
  
  if (!examinations || examinations.length === 0) {
    container.innerHTML = '<div class="appointment-item"><div class="appointment-info"><p class="patient-name">No examinations found</p><span class="appointment-time">No examination records match your search</span></div></div>';
    return;
  }
  
  var html = '';
  examinations.forEach(function(exam) {
    var examDate = exam.examination_date || exam.created_at;
    html += '<div class="appointment-item">';
    html += '<div class="appointment-info">';
    html += '<p class="patient-name">' + (exam.patient_name || 'Patient') + '</p>';
    html += '<span class="appointment-time">' + formatDate(examDate) + ' - ' + (exam.diagnosis || 'No diagnosis') + '</span>';
    html += '</div>';
    html += '<div class="appointment-actions">';
    html += '<span class="appointment-badge ' + getBadgeClass(exam.status) + '">' + capitalizeFirst(exam.status) + '</span>';
    html += '<button class="view-btn" onclick="viewExaminationDetails(' + exam.id + ')">View</button>';
    html += '</div>';
    html += '</div>';
  });
  
  container.innerHTML = html;
}

function showExaminationsError() {
  var container = document.getElementById('examinationsList');
  if (container) {
    container.innerHTML = '<div class="appointment-item"><div class="appointment-info"><p class="patient-name">Error loading examinations</p><span class="appointment-time">Please try again later</span></div></div>';
  }
}

function viewExaminationDetails(examinationId) {
  fetch(API_BASE + '/doctor/examinations/' + examinationId, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success && data.examination) {
      showExaminationModal(data.examination);
    }
  })
  .catch(function(err) { console.error('Error loading examination details:', err); });
}

function showExaminationModal(exam) {
  var modal = document.getElementById('appointmentModal');
  var modalBody = document.getElementById('appointmentModalBody');
  var modalFooter = document.getElementById('appointmentModalFooter');
  
  if (!modal || !modalBody || !modalFooter) return;
  
  var vitalSigns = exam.vital_signs || {};
  
  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; border-radius: 50%; background: #8b5cf6; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 600; margin: 0 auto 12px;">
        ${getInitials(exam.patient_name)}
      </div>
      <h4 style="font-size: 16px; font-weight: 600; color: #0f172a;">${exam.patient_name || 'Patient'}</h4>
      <p style="font-size: 13px; color: #64748b;">${formatDate(exam.examination_date)}</p>
    </div>
    
<div style="padding: 16px; background: #f8fafc; border-radius: 10px; margin-bottom: 16px;">
       <h5 style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">Vital Signs</h5>
       <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 13px;">
         <p><strong>BP:</strong> ${vitalSigns.bpSystolic || '--'}/${vitalSigns.bpDiastolic || '--'} mmHg</p>
         <p><strong>HR:</strong> ${vitalSigns.heartRate || '--'} bpm</p>
         <p><strong>Temp:</strong> ${vitalSigns.temperature || '--'} °C</p>
         <p><strong>SpO2:</strong> ${vitalSigns.spo2 || '--'}%</p>
         <p><strong>RR:</strong> ${vitalSigns.respiratory || '--'} /min</p>
         <p><strong>Glucose:</strong> ${vitalSigns.glucose || '--'} mg/dL</p>
         <p><strong>Weight:</strong> ${vitalSigns.weight || '--'} kg</p>
         <p><strong>BMI:</strong> ${vitalSigns.bmi || '--'}</p>
       </div>
    </div>
    
    <div style="padding: 16px; background: #f8fafc; border-radius: 10px; margin-bottom: 16px;">
      <p style="margin-bottom: 8px;"><strong>Chief Complaint:</strong> ${exam.chief_complaint || 'N/A'}</p>
      <p style="margin-bottom: 8px;"><strong>Diagnosis:</strong> ${exam.diagnosis || 'N/A'}</p>
      <p style="margin-bottom: 8px;"><strong>Treatment Plan:</strong> ${exam.treatment_plan || 'N/A'}</p>
      <p style="margin-top: 12px;"><strong>Recommendations:</strong> ${exam.recommendations || 'N/A'}</p>
    </div>
  `;
  
  modalFooter.innerHTML = '<button type="button" onclick="closeAppointmentModal()" style="padding: 8px 16px; border-radius: 8px; border: none; background: #f1f5f9; color: #0f172a; font-size: 13px; font-weight: 500; cursor: pointer;">Close</button>';
  
  modal.style.display = 'flex';
}

// Prescriptions Tab Functions
function loadPrescriptions() {
  var searchInput = document.getElementById('prescriptionSearchInput');
  var statusFilter = document.getElementById('prescriptionStatusFilter');
  var patientFilter = document.getElementById('prescriptionPatientFilter');
  var searchTerm = searchInput ? searchInput.value : '';
  var status = statusFilter ? statusFilter.value : '';
  var patientId = patientFilter ? patientFilter.value : '';

  if (!patientId && typeof selectedPrescriptionPatientId !== 'undefined') {
    patientId = selectedPrescriptionPatientId || '';
  }

  var url = API_BASE + '/doctor/medications?search=' + encodeURIComponent(searchTerm) + '&status=' + encodeURIComponent(status);
  if (patientId) {
    url += '&patient_id=' + encodeURIComponent(patientId);
  }

  fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      renderPrescriptionsList(data.medications || []);
    } else {
      showPrescriptionsError();
    }
  })
  .catch(function(err) { 
    console.error('Error loading prescriptions:', err);
    showPrescriptionsError();
  });
}

function renderPrescriptionsList(prescriptions) {
  var container = document.getElementById('prescriptionsList');
  if (!container) return;
  
  if (!prescriptions || prescriptions.length === 0) {
    container.innerHTML = '<div class="appointment-item"><div class="appointment-info"><p class="patient-name">No prescriptions found</p><span class="appointment-time">No prescription records match your search</span></div></div>';
    return;
  }
  
  var html = '';
  prescriptions.forEach(function(pres) {
    var statusClass = pres.status === 'active' ? 'confirmed' : (pres.status === 'completed' ? 'followup' : 'pending');
    html += '<div class="appointment-item" onclick="viewPrescriptionDetails(' + pres.id + ')" style="cursor: pointer;">';
    html += '<div class="appointment-info">';
    html += '<p class="patient-name">' + (pres.medicationName || 'Medication') + ' ' + (pres.dosage || '')+ '</p>';
    html += '<span class="appointment-time">For: ' + (pres.patient_name || pres.patient?.name || 'Patient') + ' | ' + (getFrequencyLabel(pres.frequency) || '') + '</span>';
    html += '</div>';
    html += '<div class="appointment-actions">';
    html += '<span class="appointment-badge ' + statusClass + '">' + capitalizeFirst(pres.status) + '</span>';
    if (pres.refillsRemaining > 0) {
      html += '<span class="appointment-badge checkup">' + pres.refillsRemaining + ' refills</span>';
    }
    html += '</div>';
    html += '</div>';
  });
  
  container.innerHTML = html;
}

function showPrescriptionsError() {
  var container = document.getElementById('prescriptionsList');
  if (container) {
    container.innerHTML = '<div class="appointment-item"><div class="appointment-info"><p class="patient-name">Error loading prescriptions</p><span class="appointment-time">Please try again later</span></div></div>';
  }
}

function viewPrescriptionDetails(prescriptionId) {
  fetch(API_BASE + '/doctor/medications/' + prescriptionId, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success && data.medication) {
      showPrescriptionDetailsModal(data.medication);
    }
  })
  .catch(function(err) { console.error('Error loading prescription details:', err); });
}

function showPrescriptionDetailsModal(pres) {
  var container = document.getElementById('prescriptionDetails');
  if (!container) return;
  
  var statusClass = pres.status === 'active' ? 'confirmed' : (pres.status === 'completed' ? 'followup' : 'pending');
  var patientName = pres.patient_name || (pres.patient && pres.patient.name) || 'N/A';
  var doctorName = pres.doctor_name || (pres.doctor && pres.doctor.name) || 'N/A';
  
  container.innerHTML = `
    <div style="padding: 16px; background: #f8fafc; border-radius: 10px; margin-bottom: 16px;">
      <h4 style="font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">${pres.medicationName || 'Medication'}</h4>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Dosage:</strong> ${pres.dosage || 'N/A'}</p>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Frequency:</strong> ${getFrequencyLabel(pres.frequency)}</p>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Duration:</strong> ${pres.duration || 'N/A'}</p>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Patient:</strong> ${patientName}</p>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Doctor:</strong> ${doctorName}</p>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Status:</strong> <span class="appointment-badge ${statusClass}">${capitalizeFirst(pres.status)}</span></p>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Refills Remaining:</strong> ${pres.refillsRemaining || 0}</p>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;"><strong>Prescribed Date:</strong> ${pres.prescribedDate ? new Date(pres.prescribedDate).toLocaleDateString('en-GB') : 'N/A'}</p>
      <p style="font-size: 14px; color: #64748b;"><strong>Instructions:</strong> ${pres.instructions || 'None'}</p>
    </div>
    <div style="display: flex; gap: 12px;">
      ${pres.status === 'active' ? '<button onclick="renewPrescription(' + pres.id + ')" style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; flex: 1;">Renew</button>' : ''}
      ${pres.refillsRemaining > 0 ? '<button onclick="addRefill(' + pres.id + ')" style="padding: 10px 20px; background: #8b5cf6; color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; flex: 1;">Add Refill</button>' : ''}
      ${pres.status === 'active' ? '<button onclick="stopPrescription(' + pres.id + ')" style="padding: 10px 20px; background: #fee2e2; color: #dc2626; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; flex: 1;">Stop</button>' : ''}
    </div>
  `;
}

 function renewPrescription(prescriptionId) {
  if (!confirm('Renew this prescription with the same details?')) return;
  
  fetch(API_BASE + '/doctor/medications/' + prescriptionId + '/renew', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert('Prescription renewed successfully!');
      loadPrescriptions();
      if (typeof loadPatientPrescriptions === 'function') loadPatientPrescriptions();
    } else {
      alert('Failed to renew prescription: ' + data.message);
    }
  })
  .catch(function(err) { console.error('Error renewing prescription:', err); });
}

function addRefill(prescriptionId) {
  if (!confirm('Add a refill to this prescription?')) return;
  
  fetch(API_BASE + '/doctor/medications/' + prescriptionId + '/refill', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert('Refill added successfully!');
      loadPrescriptions();
      if (typeof loadPatientPrescriptions === 'function') loadPatientPrescriptions();
      if (document.getElementById('prescriptionDetails')) {
        viewPrescriptionDetails(prescriptionId);
      }
    } else {
      alert('Failed to add refill: ' + data.message);
    }
  })
  .catch(function(err) { console.error('Error adding refill:', err); });
}

function cancelPrescription(prescriptionId) {
  stopPrescription(prescriptionId);
}

function stopPrescription(prescriptionId) {
  if (!confirm('Stop this prescription?')) return;
  
  fetch(API_BASE + '/doctor/medications/' + prescriptionId + '/cancel', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert('Prescription stopped successfully!');
      loadPrescriptions();
      if (typeof loadPatientPrescriptions === 'function') loadPatientPrescriptions();
      if (document.getElementById('prescriptionDetails')) {
        viewPrescriptionDetails(prescriptionId);
      }
    } else {
      alert('Failed to stop prescription: ' + data.message);
    }
  })
  .catch(function(err) { console.error('Error stopping prescription:', err); });
}

// Reports Tab Functions
var selectedReportFileData = null;

function initReportsTab() {
  // Load patients for report upload
  loadPatientsForReport();
  
  // Initialize file upload
  var fileInput = document.getElementById('reportFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', handleReportFileSelect);
  }
  
  // Initialize test referral checkbox
  var testReferralCheckbox = document.getElementById('isReportTestReferral');
  var testReferralOptions = document.getElementById('reportTestReferralOptions');
  if (testReferralCheckbox && testReferralOptions) {
    testReferralCheckbox.addEventListener('change', function() {
      if (this.checked) {
        testReferralOptions.classList.add('show');
      } else {
        testReferralOptions.classList.remove('show');
      }
    });
  }
  
  // Load uploaded reports
  loadUploadedReports();
}

function loadPatientsForReport() {
  fetch(API_BASE + '/doctor/patients', {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      var select = document.getElementById('reportPatientSelect');
      if (select) {
        var html = '<option value="">Select Patient</option>';
        (data.patients || []).forEach(function(patient) {
          html += '<option value="' + patient.id + '">' + (patient.name || 'Patient') + '</option>';
        });
        select.innerHTML = html;
      }
    }
  })
  .catch(function(err) { console.error('Error loading patients:', err); });
}

function handleReportFileSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  
  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('File size exceeds 10MB limit');
    e.target.value = '';
    return;
  }
  
  selectedReportFileData = file;
  
  var container = document.getElementById('selectedReportFile');
  if (container) {
    container.innerHTML = '<div class="selected-file"><div class="file-icon"><i class="fas fa-file"></i></div><div class="file-info"><div class="file-name">' + file.name + '</div><div class="file-size">' + formatFileSize(file.size) + '</div></div><button type="button" class="remove-file" onclick="removeReportFile()"><i class="fas fa-times"></i></button></div>';
  }
}

function removeReportFile() {
  selectedReportFileData = null;
  var fileInput = document.getElementById('reportFileInput');
  if (fileInput) fileInput.value = '';
  
  var container = document.getElementById('selectedReportFile');
  if (container) container.innerHTML = '';
}

function uploadReport() {
  var patientId = document.getElementById('reportPatientSelect').value;
  var reportTitle = document.getElementById('reportTitleInput').value.trim();
  
  if (!patientId) {
    alert('Please select a patient');
    return;
  }
  
  if (!reportTitle) {
    alert('Please enter a report title');
    return;
  }
  
  var reportData = {
    patient_id: patientId,
    report_title: reportTitle,
    report_type: document.getElementById('reportTypeSelect').value || 'other',
    report_description: document.getElementById('reportDescription').value
  };
  
  // Test referral options
  var isTestReferral = document.getElementById('isReportTestReferral').checked;
  if (isTestReferral) {
    reportData.is_test_referral = true;
    reportData.test_referred_to = document.getElementById('reportReferTo').value;
    reportData.urgency = document.getElementById('reportUrgency').value;
  }
  
  fetch(API_BASE + '/doctor/reports', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reportData)
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert('Report uploaded successfully!');
      // Reset form
      document.getElementById('reportUploadForm').reset();
      removeReportFile();
      loadUploadedReports();
    } else {
      alert('Failed to upload report: ' + data.message);
    }
  })
  .catch(function(err) { 
    console.error('Error uploading report:', err);
    alert('Error uploading report. Please try again.');
  });
}

function loadUploadedReports() {
  var searchTerm = document.getElementById('uploadedReportsSearch')?.value || '';
  
  fetch(API_BASE + '/doctor/reports?search=' + encodeURIComponent(searchTerm), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      renderUploadedReports(data.reports || []);
    } else {
      showReportsError();
    }
  })
  .catch(function(err) { 
    console.error('Error loading reports:', err);
    showReportsError();
  });
}

function renderUploadedReports(reports) {
  var container = document.getElementById('uploadedReportsList');
  if (!container) return;
  
  if (!reports || reports.length === 0) {
    container.innerHTML = '<div class="appointment-item"><div class="appointment-info"><p class="patient-name">No reports found</p><span class="appointment-time">No uploaded reports</span></div></div>';
    return;
  }
  
  var html = '';
  reports.forEach(function(report) {
    var reportDate = report.created_at || report.upload_date;
    html += '<div class="appointment-item">';
    html += '<div class="appointment-info">';
    html += '<p class="patient-name">' + (report.title || 'Report') + '</p>';
    html += '<span class="appointment-time">' + (report.patientName || 'Patient') + ' - ' + formatDate(reportDate) + '</span>';
    html += '</div>';
    html += '<div class="appointment-actions">';
    if (report.file_url) {
      html += '<button class="view-btn" onclick="viewReport(' + report.id + ')">View</button>';
    }
    html += '<button class="view-btn light" onclick="deleteReport(' + report.id + ')">Delete</button>';
    html += '</div>';
    html += '</div>';
  });
  
  container.innerHTML = html;
}

function showReportsError() {
  var container = document.getElementById('uploadedReportsList');
  if (container) {
    container.innerHTML = '<div class="appointment-item"><div class="appointment-info"><p class="patient-name">Error loading reports</p><span class="appointment-time">Please try again later</span></div></div>';
  }
}

function viewReport(reportId) {
  window.open(API_BASE + '/doctor/reports/' + reportId + '/download', '_blank');
}

function deleteReport(reportId) {
  if (!confirm('Are you sure you want to delete this report?')) return;
  
  fetch(API_BASE + '/doctor/reports/' + reportId, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert('Report deleted successfully!');
      loadUploadedReports();
    } else {
      alert('Failed to delete report: ' + data.message);
    }
  })
  .catch(function(err) { console.error('Error deleting report:', err); });
}

// Initialize new tab functionality when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Other initializations already exist in the main script
  // Add initialization for new tabs
  setTimeout(function() {
    initReportsTab();
  }, 1000);
});
