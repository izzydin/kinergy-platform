import { Catch } from '@nestjs/common';
import { AiExceptionFilter } from '../../filters/ai-exception.filter';

/**
 * Backwards-compatible alias for AiExceptionFilter within the conversation persistence subsystem.
 * Preserves existing import contracts while unifying error handling across all AI controllers.
 */
@Catch()
export class AiConversationExceptionFilter extends AiExceptionFilter {}
