import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RouteErrorFallback } from "./components/RouteErrorFallback";
import { ErrorBoundary } from "./components/ErrorBoundary";

describe("RouteErrorFallback", () => {
  it("renders fallback UI with reload and back buttons", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <RouteErrorFallback />,
        errorElement: <RouteErrorFallback />,
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Reload page")).toBeInTheDocument();
    expect(screen.getByText("Go back")).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) throw new Error("Child crashed");
    return <div>OK</div>;
  };

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("renders fallback UI on child error", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Reload Application")).toBeInTheDocument();
  });
});
