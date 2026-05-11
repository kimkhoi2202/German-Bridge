import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberKnob } from "./NumberKnob";

describe("NumberKnob", () => {
  it("renders the value and clamps to the range", () => {
    const onChange = vi.fn();
    render(
      <NumberKnob label="Players" value={4} onChange={onChange} min={3} max={12} />,
    );
    expect(screen.getByDisplayValue("4")).toBeInTheDocument();
  });

  it("decrements when − is clicked", () => {
    const onChange = vi.fn();
    render(<NumberKnob value={5} onChange={onChange} min={1} max={10} />);
    fireEvent.click(screen.getByLabelText(/decrease/i));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("increments when + is clicked", () => {
    const onChange = vi.fn();
    render(<NumberKnob value={5} onChange={onChange} min={1} max={10} />);
    fireEvent.click(screen.getByLabelText(/increase/i));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("disables the − button at min", () => {
    const onChange = vi.fn();
    render(<NumberKnob value={1} onChange={onChange} min={1} max={10} />);
    expect(screen.getByLabelText(/decrease/i)).toBeDisabled();
  });

  it("disables the + button at max", () => {
    const onChange = vi.fn();
    render(<NumberKnob value={10} onChange={onChange} min={1} max={10} />);
    expect(screen.getByLabelText(/increase/i)).toBeDisabled();
  });
});
