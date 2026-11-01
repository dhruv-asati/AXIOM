/** Clear dataset-backed values after a failed dashboard load. */
export function dashboardErrorState(datasetId, message) {
  return {
    summary: null,
    bookings: [],
    loadedDatasetId: datasetId,
    apiAvailable: false,
    error: message,
  }
}
