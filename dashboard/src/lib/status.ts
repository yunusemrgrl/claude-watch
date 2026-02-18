export function getStatusColor(status: string): string {
  switch (status) {
    case "DONE":
    case "completed":
      return "bg-chart-2/20 text-chart-2";
    case "FAILED":
      return "bg-chart-5/20 text-chart-5";
    case "BLOCKED":
      return "bg-chart-3/20 text-chart-3";
    case "READY":
    case "pending":
      return "bg-chart-1/20 text-chart-1";
    case "in_progress":
      return "bg-chart-4/20 text-chart-4";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function getStatusDotColor(status: string): string {
  switch (status) {
    case "DONE":
    case "completed":
      return "bg-chart-2";
    case "FAILED":
      return "bg-chart-5";
    case "BLOCKED":
      return "bg-chart-3";
    case "READY":
    case "pending":
      return "bg-chart-1";
    case "in_progress":
      return "bg-chart-4";
    default:
      return "bg-muted-foreground";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "PENDING";
    case "in_progress":
      return "IN PROGRESS";
    case "completed":
      return "COMPLETED";
    default:
      return status;
  }
}
