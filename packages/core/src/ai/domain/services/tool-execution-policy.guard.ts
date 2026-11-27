export enum ToolCapabilityClassification {
  READ_ONLY_AUTHORIZED = 'READ_ONLY_AUTHORIZED',
  READ_ONLY_PRIVILEGED = 'READ_ONLY_PRIVILEGED',
  STATE_CHANGING = 'STATE_CHANGING',
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  EXTERNAL_NETWORK_ACCESS = 'EXTERNAL_NETWORK_ACCESS',
  ARBITRARY_EXECUTION = 'ARBITRARY_EXECUTION',
  UNKNOWN = 'UNKNOWN',
}

export class ToolExecutionProhibitedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionProhibitedException';
    Object.setPrototypeOf(this, ToolExecutionProhibitedException.prototype);
  }
}

export interface ToolCapabilityMetadata {
  readonly name: string;
  readonly classification: ToolCapabilityClassification;
  readonly description: string;
  readonly isPermittedInInitialAssistant: boolean;
  readonly requiredPermissions?: readonly string[];
}

/**
 * Authoritative Policy Guard enforcing read-only orchestration and tool safety.
 *
 * Security Invariant:
 * The initial Kynergy RAG assistant operates in strict read-only mode.
 * Zero business mutation, administration, external network, or shell/code execution
 * tools are registered or permitted. All authorization is enforced deterministically
 * by backend application code, never delegated to model discretion.
 */
export class ToolExecutionPolicyGuard {
  /**
   * Complete inventory of platform capabilities and their classification.
   */
  public static readonly CAPABILITY_INVENTORY: ReadonlyMap<string, ToolCapabilityMetadata> =
    new Map([
      // Business Mutation Capabilities (PROHIBITED)
      [
        'create_sale',
        {
          name: 'create_sale',
          classification: ToolCapabilityClassification.STATE_CHANGING,
          description: 'Creates a sales transaction or order in Sales module',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'issue_refund',
        {
          name: 'issue_refund',
          classification: ToolCapabilityClassification.STATE_CHANGING,
          description: 'Issues a monetary refund for membership or service',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'update_patient_record',
        {
          name: 'update_patient_record',
          classification: ToolCapabilityClassification.STATE_CHANGING,
          description: 'Modifies patient clinical history or medical diagnosis',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'cancel_membership',
        {
          name: 'cancel_membership',
          classification: ToolCapabilityClassification.STATE_CHANGING,
          description: 'Terminates client gym membership contract',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'schedule_appointment',
        {
          name: 'schedule_appointment',
          classification: ToolCapabilityClassification.STATE_CHANGING,
          description: 'Creates or modifies clinical consultation appointment',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'adjust_inventory',
        {
          name: 'adjust_inventory',
          classification: ToolCapabilityClassification.STATE_CHANGING,
          description: 'Modifies stock counts or warehouse equipment',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'delete_user',
        {
          name: 'delete_user',
          classification: ToolCapabilityClassification.ADMINISTRATIVE,
          description: 'Deletes a user account or staff credentials',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'modify_permissions',
        {
          name: 'modify_permissions',
          classification: ToolCapabilityClassification.ADMINISTRATIVE,
          description: 'Alters RBAC roles or assigned permissions',
          isPermittedInInitialAssistant: false,
        },
      ],

      // Arbitrary Execution & External Network Capabilities (PROHIBITED)
      [
        'execute_shell',
        {
          name: 'execute_shell',
          classification: ToolCapabilityClassification.ARBITRARY_EXECUTION,
          description: 'Executes OS shell interpreter command',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'eval_code',
        {
          name: 'eval_code',
          classification: ToolCapabilityClassification.ARBITRARY_EXECUTION,
          description: 'Evaluates arbitrary script or JavaScript code',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'send_http_request',
        {
          name: 'send_http_request',
          classification: ToolCapabilityClassification.EXTERNAL_NETWORK_ACCESS,
          description: 'Issues arbitrary outbound HTTP request',
          isPermittedInInitialAssistant: false,
        },
      ],
      [
        'send_email',
        {
          name: 'send_email',
          classification: ToolCapabilityClassification.EXTERNAL_NETWORK_ACCESS,
          description: 'Dispatches external email notification',
          isPermittedInInitialAssistant: false,
        },
      ],

      // Internal Read-Only Retrieval Capabilities (Internal Service Only - Not Model-Callable)
      [
        'semantic_search',
        {
          name: 'semantic_search',
          classification: ToolCapabilityClassification.READ_ONLY_AUTHORIZED,
          description: 'Internal vector search pre-filtered strictly by authenticated tenantId',
          isPermittedInInitialAssistant: false,
        },
      ],
    ]);

  /**
   * Deterministic Read-Only Assertion:
   * Throws ToolExecutionProhibitedException for any tool execution request.
   */
  public static assertToolExecutionAllowed(toolName: string): never {
    const capability = this.CAPABILITY_INVENTORY.get(toolName);
    const classification = capability?.classification ?? ToolCapabilityClassification.UNKNOWN;

    throw new ToolExecutionProhibitedException(
      `Tool execution is prohibited. Kynergy RAG assistant operates in strict read-only mode. Attempted invocation of '${toolName}' [Classification: ${classification}] was blocked.`,
    );
  }

  /**
   * Inspects structured payload for prohibited tool or action execution properties.
   */
  public static inspectPayloadForProhibitedToolInvocation(payload: Record<string, unknown>): void {
    if (!payload || typeof payload !== 'object') return;

    if (
      'tool' in payload ||
      'tool_call' in payload ||
      'function' in payload ||
      'action' in payload
    ) {
      const candidateName = String(
        payload.tool || payload.tool_call || payload.function || payload.action || 'unknown',
      );
      this.assertToolExecutionAllowed(candidateName);
    }
  }

  /**
   * Validates tool argument structure against strict security constraints.
   */
  public static validateToolArguments(
    _toolName: string,
    args: Record<string, unknown>,
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!args || typeof args !== 'object') {
      return { isValid: false, errors: ['Tool arguments must be a non-null object.'] };
    }

    // Prototype pollution prevention
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    const hasDangerousOwnKey = dangerousKeys.some((k) =>
      Object.prototype.hasOwnProperty.call(args, k),
    );
    const hasPrototypeTampering =
      Object.getPrototypeOf(args) !== Object.prototype && Object.getPrototypeOf(args) !== null;

    if (hasDangerousOwnKey || hasPrototypeTampering) {
      errors.push('Prototype pollution detected in tool arguments.');
    }

    // Argument size limit (max 5,000 characters)
    try {
      if (JSON.stringify(args).length > 5000) {
        errors.push('Tool argument payload exceeds maximum allowable size of 5,000 characters.');
      }
    } catch {
      errors.push('Tool arguments could not be serialized.');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
