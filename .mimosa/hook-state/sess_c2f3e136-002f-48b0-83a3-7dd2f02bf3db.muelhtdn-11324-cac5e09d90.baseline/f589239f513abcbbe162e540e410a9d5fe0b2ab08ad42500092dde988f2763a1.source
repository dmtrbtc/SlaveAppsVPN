/** Ready-to-start engine configuration produced by shared Core orchestration. */
export interface CompiledEngineConfig {
  config: string
  warnings?: readonly string[]
}

/**
 * Typed config boundary consumed by CoreFacade.
 *
 * Platforms provide data sources; the provider implementation is responsible
 * for invoking the shared compiler and returning the resulting engine config.
 */
export interface CoreConfigProvider<T extends CompiledEngineConfig = CompiledEngineConfig> {
  compile(): Promise<T>
}
