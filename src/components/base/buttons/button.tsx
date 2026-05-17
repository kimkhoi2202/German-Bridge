"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, DetailedHTMLProps, FC, ReactNode } from "react";
import React, { isValidElement } from "react";
import type { ButtonProps as AriaButtonProps, LinkProps as AriaLinkProps } from "react-aria-components";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { cx, sortCx } from "@/utils/cx";
import { isReactComponent } from "@/utils/is-react-component";

export const styles = sortCx({
    common: {
        root: "gb-ui-button",
        icon: "gb-ui-button-icon",
    },
    sizes: {
        xs: {
            root: "gb-ui-button-xs",
            linkRoot: "gb-ui-button-link-xs",
        },
        sm: {
            root: "gb-ui-button-sm",
            linkRoot: "gb-ui-button-link-sm",
        },
        md: {
            root: "gb-ui-button-md",
            linkRoot: "gb-ui-button-link-md",
        },
        lg: {
            root: "gb-ui-button-lg",
            linkRoot: "gb-ui-button-link-lg",
        },
        xl: {
            root: "gb-ui-button-xl",
            linkRoot: "gb-ui-button-link-xl",
        },
    },

    colors: {
        primary: {
            root: "gb-ui-button-primary",
        },
        secondary: {
            root: "gb-ui-button-secondary",
        },
        tertiary: {
            root: "gb-ui-button-tertiary",
        },
        "link-color": {
            root: "gb-ui-button-link-color",
        },
        "link-gray": {
            root: "gb-ui-button-link-gray",
        },
        "primary-destructive": {
            root: "gb-ui-button-primary-destructive",
        },
        "secondary-destructive": {
            root: "gb-ui-button-secondary-destructive",
        },
        "tertiary-destructive": {
            root: "gb-ui-button-tertiary-destructive",
        },
        "link-destructive": {
            root: "gb-ui-button-link-destructive",
        },
    },
});

/**
 * Common props shared between button and anchor variants
 */
export interface CommonProps {
    /** Disables the button and shows a disabled state */
    isDisabled?: boolean;
    /** Shows a loading spinner and disables the button */
    isLoading?: boolean;
    /** The size variant of the button */
    size?: keyof typeof styles.sizes;
    /** The color variant of the button */
    color?: keyof typeof styles.colors;
    /** Icon component or element to show before the text */
    iconLeading?: FC<{ className?: string }> | ReactNode;
    /** Icon component or element to show after the text */
    iconTrailing?: FC<{ className?: string }> | ReactNode;
    /** Removes horizontal padding from the text content */
    noTextPadding?: boolean;
    /** When true, keeps the text visible during loading state */
    showTextWhileLoading?: boolean;
}

/**
 * Props for the button variant (non-link)
 */
export interface ButtonProps extends CommonProps, DetailedHTMLProps<Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "slot">, HTMLButtonElement> {
    /** Slot name for react-aria component */
    slot?: AriaButtonProps["slot"];
}

/**
 * Props for the link variant (anchor tag)
 */
interface LinkProps extends CommonProps, DetailedHTMLProps<Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color">, HTMLAnchorElement> {
    /** Options for the configured client side router. */
    routerOptions?: AriaLinkProps["routerOptions"];
}

/** Union type of button and link props */
export type Props = ButtonProps | LinkProps;

export const Button = ({
    size = "sm",
    color = "primary",
    children,
    className,
    noTextPadding,
    iconLeading: IconLeading,
    iconTrailing: IconTrailing,
    isDisabled: disabled,
    isLoading: loading,
    showTextWhileLoading,
    ...otherProps
}: Props) => {
    const href = "href" in otherProps ? otherProps.href : undefined;
    const Component = href ? AriaLink : AriaButton;

    const isIcon = (IconLeading || IconTrailing) && !children;
    const isLinkType = ["link-gray", "link-color", "link-destructive"].includes(color);

    noTextPadding = isLinkType || noTextPadding;

    let props = {};

    if (href) {
        props = {
            ...otherProps,

            href: disabled ? undefined : href,
        };
    } else {
        props = {
            ...otherProps,

            type: otherProps.type || "button",
            isPending: loading,
        };
    }

    return (
        <Component
            data-loading={loading ? true : undefined}
            data-icon-only={isIcon ? true : undefined}
            {...props}
            isDisabled={disabled}
            className={cx(
                styles.common.root,
                styles.sizes[size].root,
                styles.colors[color].root,
                isLinkType && styles.sizes[size].linkRoot,
                (loading || (href && (disabled || loading))) && "pointer-events-none",
                // If in `loading` state, hide everything except the loading icon (and text if `showTextWhileLoading` is true).
                loading && (showTextWhileLoading ? "gb-ui-button-loading-with-text" : "gb-ui-button-loading-icon-only"),
                className,
            )}
        >
            {/* Leading icon */}
            {isValidElement(IconLeading) && IconLeading}
            {isReactComponent(IconLeading) && <IconLeading data-icon="leading" className={styles.common.icon} />}

            {loading && (
                <svg
                    fill="none"
                    data-icon="loading"
                    viewBox="0 0 20 20"
                    className={cx(styles.common.icon, !showTextWhileLoading && "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2")}
                >
                    {/* Background circle */}
                    <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                    {/* Spinning circle */}
                    <circle
                        className="origin-center animate-spin stroke-current"
                        cx="10"
                        cy="10"
                        r="8"
                        fill="none"
                        strokeWidth="2"
                        strokeDasharray="12.5 50"
                        strokeLinecap="round"
                    />
                </svg>
            )}

            {children && (
                <span data-text className={cx("gb-ui-button-text", !noTextPadding && "gb-ui-button-text-pad")}>
                    {children}
                </span>
            )}

            {/* Trailing icon */}
            {isValidElement(IconTrailing) && IconTrailing}
            {isReactComponent(IconTrailing) && <IconTrailing data-icon="trailing" className={styles.common.icon} />}
        </Component>
    );
};
