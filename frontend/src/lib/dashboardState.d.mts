export type DashboardErrorState = {
  summary: null
  bookings: never[]
  loadedDatasetId: string
  apiAvailable: false
  error: string
}

export function dashboardErrorState(datasetId: string, message: string): DashboardErrorState
