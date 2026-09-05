import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ImageSource, isMediaPath } from "./MediaImage";

/**
 * Avatar and organisation-logo fields hold one of three shapes, and each has to
 * load a different way. Getting this wrong is not cosmetic: rendering a media
 * path straight into `<img src>` sends an unauthenticated request the API
 * rejects, and routing an external URL through the media route signs a key
 * that does not exist. Both fail as a broken image.
 */

const get = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { get: (...a: unknown[]) => get(...a) },
}));

describe("ImageSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ url: "https://signed.example/obj?sig=abc", expiresIn: 300 });
  });

  it("resolves a media path through the API and renders the signed URL", async () => {
    render(<ImageSource src="/media/user-avatar/user-1" alt="avatar" />);

    await waitFor(() => {
      expect(screen.getByAltText("avatar")).toHaveAttribute(
        "src",
        "https://signed.example/obj?sig=abc",
      );
    });
    expect(get).toHaveBeenCalledWith("/media/user-avatar/user-1");
  });

  it("renders an external URL directly, without touching the API", () => {
    const preset = "https://images.unsplash.com/photo-1534528741775?w=150";
    render(<ImageSource src={preset} alt="preset" />);

    expect(screen.getByAltText("preset")).toHaveAttribute("src", preset);
    expect(get).not.toHaveBeenCalled();
  });

  it("renders a local blob: preview directly", () => {
    // What an in-flight upload shows before the object exists.
    render(<ImageSource src="blob:http://localhost/abc-123" alt="preview" />);

    expect(screen.getByAltText("preview")).toHaveAttribute(
      "src",
      "blob:http://localhost/abc-123",
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("shows the fallback when there is no source", () => {
    render(<ImageSource src={null} alt="none" fallback={<span>AB</span>} />);

    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.queryByAltText("none")).not.toBeInTheDocument();
  });

  it("shows the fallback when a media path cannot be resolved", async () => {
    get.mockRejectedValue(new Error("403"));
    render(<ImageSource src="/media/org-logo/org-1" alt="logo" fallback={<span>none</span>} />);

    await waitFor(() => {
      expect(screen.getByText("none")).toBeInTheDocument();
    });
  });

  it("forwards className and other img attributes", () => {
    render(<ImageSource src="https://cdn.example/a.png" alt="x" className="h-5 w-5" />);
    expect(screen.getByAltText("x")).toHaveClass("h-5", "w-5");
  });
});

describe("isMediaPath", () => {
  it("recognises API media paths only", () => {
    expect(isMediaPath("/media/user-avatar/user-1")).toBe(true);
    expect(isMediaPath("https://cdn.example/a.png")).toBe(false);
    expect(isMediaPath("blob:http://localhost/abc")).toBe(false);
    expect(isMediaPath("")).toBe(false);
    expect(isMediaPath(null)).toBe(false);
  });
});
