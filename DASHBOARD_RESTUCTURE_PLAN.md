# Dashboard Restructure Plan

## Information Gathered
Based on the React implementation provided, the target dashboard structure is:

### Doctor Dashboard (doc.png reference)
1. **Welcome Section**: "Welcome back, Dr. Sarah" with subtitle
2. **4 Stat Cards in a grid (2 cols on mobile, 4 cols on desktop)**:
   - Appointments (blue) - CalendarClock icon, 12 count, "3 urgent" badge
   - Pending Reports (emerald) - FileText icon, 7 count, "2 ready" badge
   - Active Patients (amber) - Users icon, 143 count, "8 new" badge
   - Pending Tasks (rose) - ClipboardList icon, 5 count, "2 high priority" badge

3. **4 Tabs**: Schedule, Patients, Tasks, Stats
4. **Tab Content Layout**: 2-column grid (7 cols total - main: 4, sidebar: 3)

### Patient Dashboard (patient.png reference)
- Similar structure with patient-specific data
- Need to find the React implementation for patient dashboard

## Plan

### Step 1: Restructure doctor-dashboard.html
- Add proper HTML structure with Tailwind-like classes (using custom CSS)
- Implement the 4 stat cards with proper colors and icons
- Implement the 4 tabs (Schedule, Patients, Tasks, Stats)
- Implement the 2-column grid layout in each tab

### Step 2: Restructure patient-dashboard.html  
- Similar restructuring to match the React layout
- Patient-specific stat cards and tabs

## Files to be Edited
1. `doctor-dashboard.html` - Full restructure
2. `patient-dashboard.html` - Full restructure

## CSS Dependencies
- Use existing `assets/css/main.css` and `assets/css/doctor.css`
- Add custom styles inline for the new components

