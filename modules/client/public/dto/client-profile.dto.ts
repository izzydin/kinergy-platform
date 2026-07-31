/**
 * @public
 * Re-exports the internal {@link ClientProfileDto} as a stable public contract.
 *
 * External bounded contexts that need the richer profile shape (e.g. to display
 * a full client record in another module's UI) should import from this path, never
 * from the internal `application/dto/` path.
 */
export { ClientProfileDto } from '../../application/dto/client-profile.dto';
