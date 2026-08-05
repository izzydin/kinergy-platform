import { createContext, useContext, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotProvider } from '../SlotProvider';
import { SlotTarget } from '../SlotTarget';
import { SlotInject } from '../SlotInject';

// Test Context
const TestThemeContext = createContext<string>('light');

describe('Layout Slot Injection Framework', () => {
  it('renders SlotTarget fallback when no injections exist', () => {
    render(
      <SlotProvider>
        <SlotTarget name="header-actions" fallback={<span>Default Fallback</span>} />
      </SlotProvider>,
    );

    expect(screen.getByText('Default Fallback')).toBeDefined();
  });

  it('teleports SlotInject content into SlotTarget and hides fallback', () => {
    render(
      <SlotProvider>
        <SlotTarget name="header-actions" fallback={<span>Default Fallback</span>} />
        <SlotInject target="header-actions">
          <button>Injected Action</button>
        </SlotInject>
      </SlotProvider>,
    );

    expect(screen.getByText('Injected Action')).toBeDefined();
    expect(screen.queryByText('Default Fallback')).toBeNull();
  });

  it('supports multiple injections targeting the same SlotTarget', () => {
    render(
      <SlotProvider>
        <SlotTarget name="header-actions" />
        <SlotInject target="header-actions">
          <span>Action One</span>
        </SlotInject>
        <SlotInject target="header-actions">
          <span>Action Two</span>
        </SlotInject>
      </SlotProvider>,
    );

    expect(screen.getByText('Action One')).toBeDefined();
    expect(screen.getByText('Action Two')).toBeDefined();
  });

  it('handles missing targets gracefully without throwing runtime errors', () => {
    expect(() => {
      render(
        <SlotProvider>
          <SlotInject target="non-existent-target">
            <span>Orphan Content</span>
          </SlotInject>
        </SlotProvider>,
      );
    }).not.toThrow();

    expect(screen.queryByText('Orphan Content')).toBeNull();
  });

  it('preserves local React component state inside injected portal UI', () => {
    const StatefulComponent = () => {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>;
    };

    render(
      <SlotProvider>
        <SlotTarget name="page-toolbar" />
        <SlotInject target="page-toolbar">
          <StatefulComponent />
        </SlotInject>
      </SlotProvider>,
    );

    const btn = screen.getByText('Count: 0');
    expect(btn).toBeDefined();

    fireEvent.click(btn);
    expect(screen.getByText('Count: 1')).toBeDefined();
  });

  it('preserves React Context hierarchy inside injected portal UI', () => {
    const ContextAwareComponent = () => {
      const theme = useContext(TestThemeContext);
      return <div>Active Theme: {theme}</div>;
    };

    render(
      <TestThemeContext.Provider value="dark-mode">
        <SlotProvider>
          <SlotTarget name="header-actions" />
          <SlotInject target="header-actions">
            <ContextAwareComponent />
          </SlotInject>
        </SlotProvider>
      </TestThemeContext.Provider>,
    );

    expect(screen.getByText('Active Theme: dark-mode')).toBeDefined();
  });

  it('restores fallback content when injected component unmounts', () => {
    const ToggleableInjection = () => {
      const [show, setShow] = useState(true);
      return (
        <SlotProvider>
          <SlotTarget name="header-actions" fallback={<span>Fallback Restored</span>} />
          <button onClick={() => setShow(false)}>Hide Injection</button>
          {show && (
            <SlotInject target="header-actions">
              <span>Temporary Injection</span>
            </SlotInject>
          )}
        </SlotProvider>
      );
    };

    render(<ToggleableInjection />);

    expect(screen.getByText('Temporary Injection')).toBeDefined();
    expect(screen.queryByText('Fallback Restored')).toBeNull();

    fireEvent.click(screen.getByText('Hide Injection'));

    expect(screen.queryByText('Temporary Injection')).toBeNull();
    expect(screen.getByText('Fallback Restored')).toBeDefined();
  });

  it('supports nested layout targets correctly', () => {
    render(
      <SlotProvider>
        <div data-testid="outer-shell">
          <SlotTarget name="outer-target">
            <div data-testid="inner-shell">
              <SlotTarget name="inner-target" />
            </div>
          </SlotTarget>
        </div>

        <SlotInject target="inner-target">
          <span>Nested Target Injected</span>
        </SlotInject>
      </SlotProvider>,
    );

    expect(screen.getByText('Nested Target Injected')).toBeDefined();
  });

  it('maintains accessibility data attributes on SlotTarget elements', () => {
    render(
      <SlotProvider>
        <SlotTarget name="page-status" className="custom-status-class" />
      </SlotProvider>,
    );

    const targetEl = document.querySelector('[data-slot-target="page-status"]');
    expect(targetEl).not.toBeNull();
    expect(targetEl?.className).toContain('slot-target');
    expect(targetEl?.className).toContain('slot-target-page-status');
    expect(targetEl?.className).toContain('custom-status-class');
  });
});
