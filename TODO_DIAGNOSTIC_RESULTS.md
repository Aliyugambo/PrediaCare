# Diagnostic Dashboard Test Results Upload Form - IMPLEMENTATION PLAN

Status: [IN PROGRESS]

## Breakdown Steps (Approved Plan):

1. **[COMPLETE ✓]** Add 'Test Results' menu item to sidebar-menu in diagnostic-dashboard.html (data-tab="results", next to Completed).

2. **[COMPLETE ✓]** Add <div class="tab-pane" id="results"> after #completed:
   - .content-grid: Left card = Upload form (#testResultUploadForm, adapted IDs).
   - Right card = Uploaded list (search #uploadedTestResultsSearch, list #uploadedTestResultsList).

3. **[COMPLETE ✓]** Add inline JS: uploadTestResult() (mirror uploadReport(), POST /diagnostic/results), loadUploadedTestResults() (fetch /diagnostic/results/uploaded, render).
   - File handling, referral toggle, patients load, search.

4. **[COMPLETE ✓]** Handle file upload/preview, test referral toggle (adapted: Forward to Doctor, types=lab/imaging/cardiac etc.).

5. **[PENDING]** Test: Submit form (needs backend data), verify list/integration.

6. **[PENDING]** Final tests, update TODO, attempt_completion.

**Next Action**: Test form → Step 5.

