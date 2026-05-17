import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
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

  it("allows a below-min prefix while typing an in-range value", () => {
    function Harness() {
      const [value, setValue] = useState(4);
      return <NumberKnob label="Players" value={value} onChange={setValue} min={3} max={12} />;
    }

    render(<Harness />);
    const input = screen.getByLabelText("Players");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1" } });
    expect(input).toHaveValue("1");

    fireEvent.change(input, { target: { value: "10" } });
    expect(input).toHaveValue("10");
  });

  it("clamps out-of-range drafts on blur", () => {
    function Harness() {
      const [value, setValue] = useState(4);
      return <NumberKnob label="Players" value={value} onChange={setValue} min={3} max={12} />;
    }

    render(<Harness />);
    const input = screen.getByLabelText("Players");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "13" } });
    expect(input).toHaveValue("13");

    fireEvent.blur(input);
    expect(input).toHaveValue("12");
  });
});
