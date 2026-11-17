const storageKey = "cbb-unsaved-clinical:v1";

export function setUnsavedClinicalDraft(active: boolean) {
  try {
    if (active) sessionStorage.setItem(storageKey, "1");
    else sessionStorage.removeItem(storageKey);
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}

export function hasUnsavedClinicalDraft() {
  try {
    return sessionStorage.getItem(storageKey) === "1";
  } catch (error) {
    if (error instanceof DOMException) return false;
    throw error;
  }
}
