using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using PKHeX.Core;

namespace Pksx.Pkhex.Engine;

[SupportedOSPlatform("browser")]
public static partial class PkhexEngineExports
{
    private const int LegalityFixPreviewCacheCapacity = 256;
    private static readonly Lock LegalityFixPreviewCacheLock = new();
    private static readonly Dictionary<string, LegalityFixPreview> LegalityFixPreviewCache = [];
    private static readonly Queue<string> LegalityFixPreviewOrder = [];

    [JSExport]
    public static string GetVersionJson()
    {
        var pkhexCore = typeof(SaveFile).Assembly.GetName().Version?.ToString() ?? "unknown";
        var facade = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";

        return EngineJson.Serialize(
            EngineResult.Ok(new EngineVersion(pkhexCore, facade)),
            EngineJsonContext.Default.EngineResultEngineVersion);
    }

    [JSExport]
    public static string ParseSaveSmoke(byte[] bytes, string? fileName)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            return EngineJson.Serialize(
                EngineResult.Ok(SaveSummary.From(save, fileName)),
                EngineJsonContext.Default.EngineResultSaveSummary);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string ListBoxSmoke(byte[] bytes, string? fileName, int box)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            if ((uint)box >= save.BoxCount)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-box", $"Box {box} is outside the save's box range."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var slots = new List<BoxSlotSummary>(save.BoxSlotCount);
            for (var slot = 0; slot < save.BoxSlotCount; slot++)
                slots.Add(BoxSlotSummary.From(save.GetBoxSlotAtIndex(box, slot), save, box, slot));

            return EngineJson.Serialize(EngineResult.Ok(slots), EngineJsonContext.Default.EngineResultListBoxSlotSummary);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string LoadSaveWorkspaceJson(byte[] bytes, string? fileName, int box)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            if ((uint)box >= save.BoxCount)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-box", $"Box {box} is outside the save's box range."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            return EngineJson.Serialize(
                EngineResult.Ok(CreateWorkspace(save, fileName, box)),
                EngineJsonContext.Default.EngineResultSaveWorkspace);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string SerializeSaveJson(byte[] bytes, string? fileName)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var serialized = save.Write(BinaryExportSetting.None).ToArray();

            return EngineJson.Serialize(
                EngineResult.Ok(new SerializedSave(Convert.ToBase64String(serialized), serialized.Length)),
                EngineJsonContext.Default.EngineResultSerializedSave);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string ApplySlotOperationJson(byte[] bytes, string? fileName, string operationJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var operation = System.Text.Json.JsonSerializer.Deserialize(
                operationJson,
                EngineJsonContext.Default.SlotOperationRequest);

            if (operation is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-slot-operation", "Slot operation payload is missing."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var mutation = ApplySlotOperation(save, operation);
            if (!mutation.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(mutation.Code, mutation.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var serialized = save.Write(BinaryExportSetting.None).ToArray();
            var activeBox = ClampActiveBox(operation.ActiveBox, save);
            var workspace = CreateWorkspace(save, fileName, activeBox);

            return EngineJson.Serialize(
                EngineResult.Ok(new SlotOperationResult(
                    Convert.ToBase64String(serialized),
                    serialized.Length,
                    mutation.Mutated,
                    workspace)),
                EngineJsonContext.Default.EngineResultSlotOperationResult);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string PreviewPokemonSpeciesFormEditJson(byte[] bytes, string? fileName, string requestJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);
            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var request = System.Text.Json.JsonSerializer.Deserialize(
                requestJson,
                EngineJsonContext.Default.PokemonSpeciesFormPreviewRequest);
            if (request is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-pokemon-edit", "Species and Form preview payload is missing."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var sourceResult = SlotRef.From(save, request.Source);
            if (!sourceResult.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(sourceResult.Code, sourceResult.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var pokemon = sourceResult.Value.Get(save);
            if (pokemon.Species == 0)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("empty-source-slot", "Species and Form Editing needs an occupied Slot."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var projection = CreateSpeciesFormProjection(
                save,
                pokemon,
                sourceResult.Value.StorageSlotType,
                request.SpeciesId,
                request.Form);
            if (!projection.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(projection.Code, projection.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            return EngineJson.Serialize(
                EngineResult.Ok(projection.Value),
                EngineJsonContext.Default.EngineResultPokemonSpeciesFormEditProjection);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string ApplyPokemonEditOperationJson(byte[] bytes, string? fileName, string operationJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var operation = System.Text.Json.JsonSerializer.Deserialize(
                operationJson,
                EngineJsonContext.Default.PokemonEditOperationRequest);

            if (operation is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-pokemon-edit", "Pokemon edit payload is missing."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var mutation = ApplyPokemonEditOperation(save, operation);
            if (!mutation.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(mutation.Code, mutation.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var serialized = save.Write(BinaryExportSetting.None).ToArray();
            var activeBox = ClampActiveBox(operation.ActiveBox, save);
            var workspace = CreateWorkspace(save, fileName, activeBox);

            return EngineJson.Serialize(
                EngineResult.Ok(new PokemonEditOperationResult(
                    Convert.ToBase64String(serialized),
                    serialized.Length,
                    mutation.Mutated,
                    workspace)),
                EngineJsonContext.Default.EngineResultPokemonEditOperationResult);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string ApplySaveFileEditOperationJson(byte[] bytes, string? fileName, string operationJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);
            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var operation = System.Text.Json.JsonSerializer.Deserialize(
                operationJson,
                EngineJsonContext.Default.SaveFileEditOperationRequest);
            if (operation is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-save-file-edit", "Save File edit payload is missing."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var mutation = ApplySaveFileEditOperation(save, operation);
            if (!mutation.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(mutation.Code, mutation.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var serialized = save.Write(BinaryExportSetting.None).ToArray();
            var workspace = CreateWorkspace(save, fileName, ClampActiveBox(operation.ActiveBox, save));
            return EngineJson.Serialize(
                EngineResult.Ok(new SaveFileEditOperationResult(
                    Convert.ToBase64String(serialized),
                    serialized.Length,
                    mutation.Mutated,
                    workspace)),
                EngineJsonContext.Default.EngineResultSaveFileEditOperationResult);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string GetSaveFileInventoryCatalogueJson(byte[] bytes, string? fileName)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);
            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            return EngineJson.Serialize(
                EngineResult.Ok(SaveFileInventoryCatalogue.From(save)),
                EngineJsonContext.Default.EngineResultSaveFileInventoryCatalogue);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string GetPokemonCreationCatalogueJson(byte[] bytes, string? fileName)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);
            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var template = save.BlankPKM;
            EntityTemplates.TemplateFields(template, save);
            var availableSpecies = new List<PokemonSpeciesOption>();
            for (ushort id = 1; id <= template.MaxSpeciesID; id++)
            {
                if (save.Personal.IsPresentInGame(id, 0))
                    availableSpecies.Add(new PokemonSpeciesOption(id, PokemonName(id)));
            }

            var defaultSpecies = template.Species > 0 && save.Personal.IsPresentInGame(template.Species, 0)
                ? new PokemonSpeciesOption(template.Species, PokemonName(template.Species))
                : null;

            return EngineJson.Serialize(
                EngineResult.Ok(new PokemonCreationCatalogue(defaultSpecies, availableSpecies)),
                EngineJsonContext.Default.EngineResultPokemonCreationCatalogue);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string CreatePokemonJson(byte[] bytes, string? fileName, string operationJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);
            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var operation = System.Text.Json.JsonSerializer.Deserialize(
                operationJson,
                EngineJsonContext.Default.PokemonCreationRequest);
            if (operation is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-pokemon-creation", "Create Pokemon payload is missing."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var mutation = CreatePokemon(save, operation);
            if (!mutation.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(mutation.Code, mutation.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var serialized = save.Write(BinaryExportSetting.None).ToArray();
            var activeBox = ClampActiveBox(operation.ActiveBox, save);
            var workspace = CreateWorkspace(save, fileName, activeBox);

            return EngineJson.Serialize(
                EngineResult.Ok(new PokemonCreationResult(
                    Convert.ToBase64String(serialized),
                    serialized.Length,
                    mutation.Mutated,
                    workspace)),
                EngineJsonContext.Default.EngineResultPokemonCreationResult);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string CheckSlotLegalityJson(byte[] bytes, string? fileName, string sourceJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var source = System.Text.Json.JsonSerializer.Deserialize(
                sourceJson,
                EngineJsonContext.Default.SaveSlotRef);

            if (source is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-slot", "Legality Check needs a source Slot."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var sourceResult = SlotRef.From(save, source);
            if (!sourceResult.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(sourceResult.Code, sourceResult.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var pokemon = sourceResult.Value.Get(save);
            if (pokemon.Species == 0)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("empty-source-slot", "Legality Check needs an occupied Slot."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            return EngineJson.Serialize(
                EngineResult.Ok(CreateLegalityReport(pokemon, sourceResult.Value.StorageSlotType)),
                EngineJsonContext.Default.EngineResultLegalityReport);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string PreviewPokemonActionsJson(byte[] bytes, string? fileName, string sourceJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);
            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var source = System.Text.Json.JsonSerializer.Deserialize(
                sourceJson,
                EngineJsonContext.Default.SaveSlotRef);
            var sourceResult = SlotRef.From(save, source);
            if (!sourceResult.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(sourceResult.Code, sourceResult.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var pokemon = sourceResult.Value.Get(save);
            if (pokemon.Species == 0)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("empty-source-slot", "Pokemon Actions need an occupied Slot."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            return EngineJson.Serialize(
                EngineResult.Ok(CreatePokemonActionPreview(pokemon, sourceResult.Value.StorageSlotType)),
                EngineJsonContext.Default.EngineResultPokemonActionPreview);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string ApplyPokemonActionJson(byte[] bytes, string? fileName, string actionJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);
            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var request = System.Text.Json.JsonSerializer.Deserialize(
                actionJson,
                EngineJsonContext.Default.PokemonActionRequest);
            if (request?.Source is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-pokemon-action", "Pokemon Action needs a source Slot."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var sourceResult = SlotRef.From(save, request.Source);
            if (!sourceResult.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(sourceResult.Code, sourceResult.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var pokemon = sourceResult.Value.Get(save);
            if (pokemon.Species == 0)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("empty-source-slot", "Pokemon Actions need an occupied Slot."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var mutation = ApplyPokemonAction(
                pokemon.Clone(),
                sourceResult.Value.StorageSlotType,
                request.Kind,
                request.ChoiceId);
            if (!mutation.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(mutation.Code, mutation.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            sourceResult.Value.Set(save, mutation.Pokemon);
            var serialized = save.Write(BinaryExportSetting.None).ToArray();
            var activeBox = ClampActiveBox(request.ActiveBox, save);

            return EngineJson.Serialize(
                EngineResult.Ok(new PokemonActionResult(
                    Convert.ToBase64String(serialized),
                    serialized.Length,
                    true,
                    CreateWorkspace(save, fileName, activeBox),
                    mutation.Changes)),
                EngineJsonContext.Default.EngineResultPokemonActionResult);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string PreviewStoredPokemonActionsJson(string entityBytesBase64)
    {
        try
        {
            var pokemon = ParseStoredPokemon(entityBytesBase64);
            if (pokemon is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-stored-pokemon", "Pokemon Storage entry is missing entity data."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            return EngineJson.Serialize(
                EngineResult.Ok(CreatePokemonActionPreview(pokemon, StorageSlotType.Box)),
                EngineJsonContext.Default.EngineResultPokemonActionPreview);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("invalid-stored-pokemon", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string ApplyStoredPokemonActionJson(string entityBytesBase64, string actionJson)
    {
        try
        {
            var pokemon = ParseStoredPokemon(entityBytesBase64);
            if (pokemon is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-stored-pokemon", "Pokemon Storage entry is missing entity data."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var request = System.Text.Json.JsonSerializer.Deserialize(
                actionJson,
                EngineJsonContext.Default.StoredPokemonActionRequest);
            if (request is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-pokemon-action", "Pokemon Action payload is missing."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var mutation = ApplyPokemonAction(
                pokemon.Clone(),
                StorageSlotType.Box,
                request.Kind,
                request.ChoiceId);
            if (!mutation.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(mutation.Code, mutation.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var entityBytes = mutation.Pokemon.Data.ToArray();
            return EngineJson.Serialize(
                EngineResult.Ok(new StoredPokemonActionResult(
                    Convert.ToBase64String(entityBytes),
                    true,
                    BoxSlotSummary.From(
                        mutation.Pokemon,
                        BlankSaveForStoredPokemon(mutation.Pokemon),
                        0,
                        0),
                    mutation.Changes)),
                EngineJsonContext.Default.EngineResultStoredPokemonActionResult);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    [JSExport]
    public static string ImportStoredPokemonJson(byte[] bytes, string? fileName, string importJson)
    {
        try
        {
            var save = SaveUtil.GetSaveFile(bytes, fileName);

            if (save is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("unsupported-save", "PKHeX.Core could not recognize this save file."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var request = System.Text.Json.JsonSerializer.Deserialize(
                importJson,
                EngineJsonContext.Default.StoredPokemonImportRequest);

            if (request is null)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail("invalid-pokemon-import", "Pokemon import payload is missing."),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var mutation = ImportStoredPokemon(save, request);
            if (!mutation.Ok)
            {
                return EngineJson.Serialize(
                    EngineResult.Fail(mutation.Code, mutation.Message),
                    EngineJsonContext.Default.EngineResultObject);
            }

            var serialized = save.Write(BinaryExportSetting.None).ToArray();
            var activeBox = ClampActiveBox(request.ActiveBox, save);
            var workspace = CreateWorkspace(save, fileName, activeBox);

            return EngineJson.Serialize(
                EngineResult.Ok(new StoredPokemonImportResult(
                    Convert.ToBase64String(serialized),
                    serialized.Length,
                    mutation.Mutated,
                    workspace)),
                EngineJsonContext.Default.EngineResultStoredPokemonImportResult);
        }
        catch (Exception ex)
        {
            return EngineJson.Serialize(
                EngineResult.Fail("unknown-engine-error", ex.Message),
                EngineJsonContext.Default.EngineResultObject);
        }
    }

    private static SaveWorkspace CreateWorkspace(SaveFile save, string? fileName, int box)
    {
        var partySlots = new List<PartySlotSummary>(save.PartyCount);
        for (var slot = 0; slot < save.PartyCount; slot++)
            partySlots.Add(PartySlotSummary.From(save.GetPartySlotAtIndex(slot), save, slot));

        var boxSlots = new List<BoxSlotSummary>(save.BoxSlotCount);
        for (var slot = 0; slot < save.BoxSlotCount; slot++)
            boxSlots.Add(BoxSlotSummary.From(save.GetBoxSlotAtIndex(box, slot), save, box, slot));

        return new SaveWorkspace(
            SaveSummary.From(save, fileName),
            partySlots,
            boxSlots,
            SaveFileEditableProjection.From(save));
    }

    private static SlotMutationResult ApplySlotOperation(SaveFile save, SlotOperationRequest operation)
    {
        var sourceResult = SlotRef.From(save, operation.Source);
        if (!sourceResult.Ok)
            return SlotMutationResult.Fail(sourceResult.Code, sourceResult.Message);

        var source = sourceResult.Value;
        var sourcePokemon = source.Get(save);
        if (sourcePokemon.Species == 0)
            return SlotMutationResult.Fail("empty-source-slot", "Move, Copy, and Clear Slot need an occupied source Slot.");

        return operation.Kind switch
        {
            "move" => ApplyMove(save, source, operation.Destination),
            "copy" => ApplyCopy(save, source, operation.Destination),
            "clear" => ApplyClear(save, source),
            _ => SlotMutationResult.Fail("unsupported-slot-operation", $"Slot operation '{operation.Kind}' is not supported."),
        };
    }

    private static SlotMutationResult ApplyPokemonEditOperation(SaveFile save, PokemonEditOperationRequest operation)
    {
        var sourceResult = SlotRef.From(save, operation.Source);
        if (!sourceResult.Ok)
            return SlotMutationResult.Fail(sourceResult.Code, sourceResult.Message);

        var source = sourceResult.Value;
        var pokemon = source.Get(save).Clone();
        if (pokemon.Species == 0)
            return SlotMutationResult.Fail("empty-source-slot", "Pokemon editing needs an occupied source Slot.");

        if (
            operation.SpeciesId is null &&
            operation.Form is null &&
            operation.Nickname is null &&
            operation.Level is null &&
            operation.Experience is null &&
            operation.NatureId is null &&
            operation.HeldItemId is null &&
            operation.AbilityIndex is null &&
            operation.MetData is null &&
            operation.OriginalTrainer is null &&
            operation.Ivs is null &&
            operation.Evs is null &&
            operation.Moves is null &&
            operation.FriendshipEdits is null &&
            operation.TeraType is null)
            return SlotMutationResult.Fail("invalid-pokemon-edit", "Choose a Pokemon edit to apply.");

        if (operation.Level is not null && operation.Experience is not null)
            return SlotMutationResult.Fail("invalid-pokemon-edit", "Apply either level or experience, not both.");

        if (operation.SpeciesId is null != operation.Form is null)
            return SlotMutationResult.Fail("invalid-pokemon-edit", "Species and Form edits require both values.");

        var originalSpecies = pokemon.Species;
        var originalForm = pokemon.Form;
        var originalNickname = pokemon.Nickname;
        var originalIsNicknamed = pokemon.IsNicknamed;
        var originalAbility = pokemon.Ability;
        var originalAbilityNumber = pokemon.AbilityNumber;
        var originalGender = pokemon.Gender;
        var originalLevel = pokemon.CurrentLevel;
        var originalExperience = pokemon.EXP;
        var originalNature = pokemon.Nature;
        var originalStatNature = pokemon.StatNature;
        var originalPid = pokemon.PID;
        var originalHeldItem = pokemon.HeldItem;
        var originalMetLocation = pokemon.MetLocation;
        var originalMetLevel = pokemon.MetLevel;
        var originalMetDate = pokemon.MetDate;
        var originalVersion = pokemon.Version;
        var originalBall = pokemon.Ball;
        var originalTrainerName = pokemon.OriginalTrainerName;
        var originalTrainerId = pokemon.TID16;
        var originalSecretId = pokemon.SID16;
        var originalTrainerGender = pokemon.OriginalTrainerGender;
        var originalLanguage = pokemon.Language;
        var originalLegalityMessages = operation.MetData is null && operation.OriginalTrainer is null
            ? null
            : InvalidLegalityMessages(pokemon, source.StorageSlotType)
                .Select(LegalityMessageKey)
                .ToHashSet(StringComparer.Ordinal);
        int[] originalIvs = [pokemon.IV_HP, pokemon.IV_ATK, pokemon.IV_DEF, pokemon.IV_SPA, pokemon.IV_SPD, pokemon.IV_SPE];
        int[] originalEvs = [pokemon.EV_HP, pokemon.EV_ATK, pokemon.EV_DEF, pokemon.EV_SPA, pokemon.EV_SPD, pokemon.EV_SPE];
        ushort[] originalMoves = [pokemon.Move1, pokemon.Move2, pokemon.Move3, pokemon.Move4];
        int[] originalPp = [pokemon.Move1_PP, pokemon.Move2_PP, pokemon.Move3_PP, pokemon.Move4_PP];
        int[] originalPpUps = [pokemon.Move1_PPUps, pokemon.Move2_PPUps, pokemon.Move3_PPUps, pokemon.Move4_PPUps];
        var originalFriendship = pokemon.CurrentFriendship;
        var originalAffection = CurrentAffection(pokemon);
        var originalTeraType = TeraTypeState(pokemon);

        if (operation.SpeciesId is ushort speciesId && operation.Form is byte form)
        {
            var speciesFormResult = ApplySpeciesFormEdit(save, pokemon, speciesId, form);
            if (!speciesFormResult.Ok)
                return speciesFormResult;
        }

        if (operation.Nickname is string nickname)
        {
            if (nickname.Length == 0)
            {
                CommonEdits.SetDefaultNickname(pokemon);
            }
            else
            {
                if (nickname.Length > pokemon.MaxStringLengthNickname)
                    return SlotMutationResult.Fail(
                        "invalid-pokemon-edit",
                        $"Nickname is too long for this Pokemon format. Maximum length is {pokemon.MaxStringLengthNickname} characters.");

                try
                {
                    CommonEdits.SetNickname(pokemon, nickname);
                }
                catch (Exception ex)
                {
                    return SlotMutationResult.Fail("invalid-pokemon-edit", ex.Message);
                }

                if (!StringComparer.Ordinal.Equals(pokemon.Nickname, nickname))
                    return SlotMutationResult.Fail(
                        "invalid-pokemon-edit",
                        "Nickname contains characters that are not valid for this Pokemon format or language.");
            }
        }

        if (operation.Level is int level)
        {
            if (!Experience.IsValidLevel((byte)level) || level < Experience.MinLevel || level > Experience.MaxLevel)
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"Level must be between {Experience.MinLevel} and {Experience.MaxLevel}.");

            pokemon.CurrentLevel = (byte)level;
        }
        else if (operation.Experience is uint experience)
        {
            var growth = pokemon.PersonalInfo.EXPGrowth;
            var min = Experience.GetEXP((byte)Experience.MinLevel, growth);
            var max = Experience.GetEXP((byte)Experience.MaxLevel, growth);

            if (experience < min || experience > max)
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"Experience must be between {min} and {max}.");

            pokemon.EXP = experience;
        }

        if (operation.NatureId is int natureId)
        {
            var constraints = SlotDetailProjection.NatureEditConstraints(pokemon);
            if (!constraints.Supported)
                return SlotMutationResult.Fail(
                    "unsupported-pokemon-edit",
                    constraints.UnsupportedReason ?? "Nature Editing is not supported for this Pokemon format.");

            var option = constraints.Options.Find(candidate => candidate.Id == natureId);
            if (option is null)
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"Nature {natureId} is not available.");

            if (natureId != constraints.CurrentNatureId)
                CommonEdits.SetNature(pokemon, (Nature)natureId);
        }

        if (operation.HeldItemId is int heldItemId)
        {
            var constraints = SlotDetailProjection.HeldItemEditConstraints(pokemon, save);
            if (!constraints.Supported)
                return SlotMutationResult.Fail(
                    "unsupported-pokemon-edit",
                    constraints.UnsupportedReason ?? "Held Item Editing is not supported for this Pokemon.");

            var option = constraints.Options.Find(candidate => candidate.Id == heldItemId);
            if (option is null)
                return SlotMutationResult.Fail(
                    "unsupported-pokemon-edit",
                    $"Item {heldItemId} is not available for this Save File and Pokemon Entity format.");

            if (!option.Available)
                return SlotMutationResult.Fail(
                    "invalid-pokemon-edit",
                    option.UnavailableReason ?? $"{option.Name} is not available for this Pokemon.");

            pokemon.HeldItem = heldItemId;
            var invalidItem = CreateLegalityMessages(
                new LegalityAnalysis(pokemon, source.StorageSlotType),
                includeGeneric: true).FirstOrDefault(message =>
                    StringComparer.Ordinal.Equals(message.Identifier, CheckIdentifier.HeldItem.ToString()) &&
                    StringComparer.Ordinal.Equals(message.Severity, Severity.Invalid.ToString()));
            if (invalidItem is not null)
                return SlotMutationResult.Fail(
                    "invalid-pokemon-edit",
                    $"Held Item edit is not legal for this Pokemon. {invalidItem.Message}");
        }

        if (operation.AbilityIndex is int abilityIndex)
        {
            var constraints = SlotDetailProjection.AbilityEditConstraints(pokemon);
            var option = constraints.Options.Find(candidate => candidate.Index == abilityIndex);
            if (option is null)
                return SlotMutationResult.Fail(
                    "unsupported-pokemon-edit",
                    $"Ability slot {abilityIndex + 1} is not supported by this Pokemon's species, form, or format.");

            if (!option.Available)
                return SlotMutationResult.Fail(
                    "invalid-pokemon-edit",
                    option.UnavailableReason ?? $"{option.Name} is not legal for this Pokemon.");

            if (abilityIndex != constraints.CurrentAbilityIndex)
                pokemon.SetAbilityIndex(abilityIndex);
        }

        if (operation.MetData is not null)
        {
            var metDataResult = ApplyMetDataEdit(pokemon, operation.MetData);
            if (!metDataResult.Ok)
                return metDataResult;
        }

        if (operation.OriginalTrainer is not null)
        {
            var trainerResult = ApplyOriginalTrainerEdit(pokemon, operation.OriginalTrainer);
            if (!trainerResult.Ok)
                return trainerResult;
        }

        if (operation.Ivs is not null)
        {
            var ivs = StatEditSetToArray(operation.Ivs);
            foreach (var iv in ivs)
            {
                if (iv < 0 || iv > pokemon.MaxIV)
                    return SlotMutationResult.Fail("invalid-pokemon-edit", $"IV values must be between 0 and {pokemon.MaxIV} for this Pokemon format.");
            }

            pokemon.SetIVs(ivs);
        }

        if (operation.Evs is not null)
        {
            var evs = StatEditSetToArray(operation.Evs);
            foreach (var ev in evs)
            {
                if (ev < 0 || ev > pokemon.MaxEV)
                    return SlotMutationResult.Fail("invalid-pokemon-edit", $"EV values must be between 0 and {pokemon.MaxEV} for this Pokemon format.");
            }

            var maxTotalEv = pokemon.MaxEV > EffortValues.Max255
                ? pokemon.MaxEV * evs.Length
                : EffortValues.Max510;
            var totalEv = evs.Sum();
            if (totalEv > maxTotalEv)
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"Total EV values must be {maxTotalEv} or less for this Pokemon format.");

            pokemon.SetEVs(evs);
        }

        if (operation.Moves is not null)
        {
            var moveResult = ApplyMoveSetEdits(pokemon, operation.Moves, source.StorageSlotType);
            if (!moveResult.Ok)
                return moveResult;
        }

        if (operation.FriendshipEdits is not null)
        {
            var friendshipResult = ApplyFriendshipEdits(pokemon, operation.FriendshipEdits);
            if (!friendshipResult.Ok)
                return friendshipResult;
        }

        if (operation.TeraType is int teraType)
        {
            if (pokemon is not ITeraType tera)
                return SlotMutationResult.Fail(
                    "unsupported-pokemon-edit",
                    "Tera Type Editing is not supported for this Pokemon format.");

            if (!TeraTypeUtil.CanChangeTeraType(pokemon.Species))
                return SlotMutationResult.Fail(
                    "unsupported-pokemon-edit",
                    "Tera Type Editing is not supported for this Pokemon species.");

            if (teraType < 0 || teraType > byte.MaxValue || !TeraTypeUtil.IsOverrideValid((byte)teraType))
                return SlotMutationResult.Fail("invalid-pokemon-edit", "Choose a valid Tera Type.");

            tera.SetTeraType((byte)teraType);
        }

        if (originalLegalityMessages is not null)
        {
            var introducedIssue = InvalidLegalityMessages(pokemon, source.StorageSlotType)
                .FirstOrDefault(message => !originalLegalityMessages.Contains(LegalityMessageKey(message)));
            if (introducedIssue is not null)
                return SlotMutationResult.Fail(
                    "invalid-pokemon-edit",
                    $"{LegalityEditFailurePrefix(operation)} {introducedIssue.Message}");
        }

        if (pokemon.PartyStatsPresent)
            pokemon.ResetPartyStats();

        var mutated =
            originalSpecies != pokemon.Species ||
            originalForm != pokemon.Form ||
            !StringComparer.Ordinal.Equals(originalNickname, pokemon.Nickname) ||
            originalIsNicknamed != pokemon.IsNicknamed ||
            originalAbility != pokemon.Ability ||
            originalAbilityNumber != pokemon.AbilityNumber ||
            originalGender != pokemon.Gender ||
            originalLevel != pokemon.CurrentLevel ||
            originalExperience != pokemon.EXP ||
            originalNature != pokemon.Nature ||
            originalStatNature != pokemon.StatNature ||
            originalPid != pokemon.PID ||
            originalHeldItem != pokemon.HeldItem ||
            originalMetLocation != pokemon.MetLocation ||
            originalMetLevel != pokemon.MetLevel ||
            originalMetDate != pokemon.MetDate ||
            originalVersion != pokemon.Version ||
            originalBall != pokemon.Ball ||
            !StringComparer.Ordinal.Equals(originalTrainerName, pokemon.OriginalTrainerName) ||
            originalTrainerId != pokemon.TID16 ||
            originalSecretId != pokemon.SID16 ||
            originalTrainerGender != pokemon.OriginalTrainerGender ||
            originalLanguage != pokemon.Language ||
            !originalIvs.SequenceEqual([pokemon.IV_HP, pokemon.IV_ATK, pokemon.IV_DEF, pokemon.IV_SPA, pokemon.IV_SPD, pokemon.IV_SPE]) ||
            !originalEvs.SequenceEqual([pokemon.EV_HP, pokemon.EV_ATK, pokemon.EV_DEF, pokemon.EV_SPA, pokemon.EV_SPD, pokemon.EV_SPE]) ||
            !originalMoves.SequenceEqual([pokemon.Move1, pokemon.Move2, pokemon.Move3, pokemon.Move4]) ||
            !originalPp.SequenceEqual([pokemon.Move1_PP, pokemon.Move2_PP, pokemon.Move3_PP, pokemon.Move4_PP]) ||
            !originalPpUps.SequenceEqual([pokemon.Move1_PPUps, pokemon.Move2_PPUps, pokemon.Move3_PPUps, pokemon.Move4_PPUps]) ||
            originalFriendship != pokemon.CurrentFriendship ||
            originalAffection != CurrentAffection(pokemon) ||
            originalTeraType != TeraTypeState(pokemon);
        if (mutated)
            source.Set(save, pokemon);

        return SlotMutationResult.Success(mutated);
    }

    private static SlotMutationResult ApplySaveFileEditOperation(SaveFile save, SaveFileEditOperationRequest operation)
    {
        if (operation.TrainerProfile is null && operation.Money is null && (operation.Inventory is null || operation.Inventory.Count == 0))
            return SlotMutationResult.Fail("invalid-save-file-edit", "Choose a Save File edit to apply.");

        var mutated = false;
        if (operation.TrainerProfile is { } trainer)
        {
            if (trainer.TrainerName is string trainerName)
            {
                if (!SaveFileFieldSupport.IsOverridden(save, nameof(SaveFile.OT)))
                    return SlotMutationResult.Fail("unsupported-save-file-edit", "Trainer name editing is not supported for this Save File format.");
                if (string.IsNullOrWhiteSpace(trainerName) || trainerName.Length > save.MaxStringLengthTrainer)
                    return SlotMutationResult.Fail("invalid-save-file-edit", $"Trainer name must be between 1 and {save.MaxStringLengthTrainer} characters.");

                var original = save.OT;
                save.OT = trainerName;
                // Formats normalize/truncate trainer names, so only reject a readback that lost everything.
                if (string.IsNullOrWhiteSpace(save.OT))
                {
                    save.OT = original;
                    return SlotMutationResult.Fail("invalid-save-file-edit", "Trainer name contains characters that are not valid for this Save File format or language.");
                }
                mutated |= !StringComparer.Ordinal.Equals(original, save.OT);
            }

            if (trainer.Gender is string gender)
            {
                if (!SaveFileFieldSupport.IsOverridden(save, nameof(SaveFile.Gender)))
                    return SlotMutationResult.Fail("unsupported-save-file-edit", "Trainer gender editing is not supported for this Save File format.");
                var value = gender switch
                {
                    "male" => (byte)0,
                    "female" => (byte)1,
                    _ => byte.MaxValue,
                };
                if (value == byte.MaxValue)
                    return SlotMutationResult.Fail("invalid-save-file-edit", "Trainer gender must be male or female.");

                var original = save.Gender;
                save.Gender = value;
                mutated |= original != save.Gender;
            }
        }

        if (operation.Money is long money)
        {
            if (!SaveFileFieldSupport.IsOverridden(save, nameof(SaveFile.Money)))
                return SlotMutationResult.Fail("unsupported-save-file-edit", "Money editing is not supported for this Save File format.");
            if (money < 0 || money > save.MaxMoney)
                return SlotMutationResult.Fail("invalid-save-file-edit", $"Money must be between 0 and {save.MaxMoney} for this Save File format.");

            var original = save.Money;
            save.Money = (uint)money;
            mutated |= original != save.Money;
        }

        if (operation.Inventory is { Count: > 0 } inventoryEdits)
        {
            var bag = save.Inventory;
            if (bag.Pouches.Count == 0)
                return SlotMutationResult.Fail("unsupported-save-file-edit", "Inventory editing is not supported for this Save File format.");

            var inventoryMutated = false;
            var seen = new HashSet<(InventoryType, int)>();
            foreach (var edit in inventoryEdits)
            {
                if (!Enum.TryParse<InventoryType>(edit.Pocket, true, out var type))
                    return SlotMutationResult.Fail("invalid-save-file-edit", $"Inventory pocket '{edit.Pocket}' is not supported.");

                var pouch = bag.Pouches.FirstOrDefault(candidate => candidate.Type == type);
                if (pouch is null)
                    return SlotMutationResult.Fail("unsupported-save-file-edit", $"{type} is not available in this Save File format.");
                if (edit.ItemId <= 0 || edit.ItemId > save.MaxItemID || edit.ItemId > ushort.MaxValue || !pouch.CanContain((ushort)edit.ItemId))
                    return SlotMutationResult.Fail("invalid-save-file-edit", $"Item {edit.ItemId} cannot be stored in {type}.");
                if (!seen.Add((type, edit.ItemId)))
                    return SlotMutationResult.Fail("invalid-save-file-edit", $"Item {edit.ItemId} has more than one staged edit in {type}.");

                var existing = pouch.Items.FirstOrDefault(item => item.Index == edit.ItemId && item.Count > 0);
                switch (edit.Kind)
                {
                    case "set":
                        {
                            if (existing is null)
                                return SlotMutationResult.Fail("invalid-save-file-edit", $"Item {edit.ItemId} is no longer present in {type}.");
                            var quantity = ValidateInventoryQuantity(bag, type, edit.ItemId, edit.Quantity);
                            if (!quantity.Ok)
                                return quantity;
                            var value = edit.Quantity!.Value;
                            if (!bag.IsLegal(type, edit.ItemId, value))
                                return SlotMutationResult.Fail("invalid-save-file-edit", $"Item {edit.ItemId} is not valid in {type} with quantity {value}.");
                            inventoryMutated |= existing.Count != value;
                            existing.Count = value;
                            break;
                        }
                    case "add":
                        {
                            if (existing is not null)
                                return SlotMutationResult.Fail("invalid-save-file-edit", $"Item {edit.ItemId} is already present in {type}.");
                            if (pouch.FindIndexFirstEmptySlot() < 0)
                                return SlotMutationResult.Fail("unsupported-save-file-edit", $"{type} is full.");
                            var quantity = ValidateInventoryQuantity(bag, type, edit.ItemId, edit.Quantity);
                            if (!quantity.Ok)
                                return quantity;
                            var value = edit.Quantity!.Value;
                            if (!bag.IsLegal(type, edit.ItemId, value))
                                return SlotMutationResult.Fail("invalid-save-file-edit", $"Item {edit.ItemId} is not valid in {type} with quantity {value}.");
                            if (pouch.GiveItem(bag, (ushort)edit.ItemId, value) < 0)
                                return SlotMutationResult.Fail("unsupported-save-file-edit", $"{type} is full.");
                            inventoryMutated = true;
                            break;
                        }
                    case "remove":
                        if (existing is null)
                            return SlotMutationResult.Fail("invalid-save-file-edit", $"Item {edit.ItemId} is no longer present in {type}.");
                        existing.Clear();
                        pouch.ClearCount0();
                        inventoryMutated = true;
                        break;
                    default:
                        return SlotMutationResult.Fail("invalid-save-file-edit", $"Inventory edit '{edit.Kind}' is not supported.");
                }
            }

            if (inventoryMutated)
                bag.CopyTo(save);
            mutated |= inventoryMutated;
        }

        return SlotMutationResult.Success(mutated);
    }

    private static SlotMutationResult ValidateInventoryQuantity(PlayerBag bag, InventoryType type, int itemId, int? quantity)
    {
        var max = bag.GetMaxCount(type, itemId);
        if (quantity is null || quantity < 1 || quantity > max)
            return SlotMutationResult.Fail("invalid-save-file-edit", $"Quantity for item {itemId} must be between 1 and {max} in {type}.");
        return SlotMutationResult.Success(false);
    }

    private static SpeciesFormProjectionResult CreateSpeciesFormProjection(
        SaveFile save,
        PKM source,
        StorageSlotType storageSlotType,
        ushort speciesId,
        byte form)
    {
        var preview = source.Clone();
        var mutation = ApplySpeciesFormEdit(save, preview, speciesId, form);
        if (!mutation.Ok)
            return SpeciesFormProjectionResult.Fail(mutation.Code, mutation.Message);

        if (preview.PartyStatsPresent)
            preview.ResetPartyStats();

        var species = new List<PokemonSpeciesOption>();
        for (ushort id = 1; id <= Math.Min(save.MaxSpeciesID, source.MaxSpeciesID); id++)
        {
            if (!save.Personal.IsSpeciesInGame(id))
                continue;

            species.Add(new PokemonSpeciesOption(id, PokemonName(id)));
        }

        var forms = GetFormOptions(save, preview.Context, speciesId);
        var legality = CreateLegalityReport(preview, storageSlotType);
        var consequences = CreateSpeciesFormConsequences(source, preview, forms, legality);
        var projection = new PokemonSpeciesFormEditProjection(
            species,
            forms,
            new PokemonSpeciesFormPreview(
                preview.Species,
                PokemonName(preview.Species),
                preview.Form,
                FormName(forms, preview.Form),
                SlotDetailProjection.Ability(preview),
                SlotDetailProjection.Gender(preview),
                SlotDetailProjection.Types(preview).Select(type => type.Name).ToList(),
                SlotDetailProjection.Moves(preview).Select(move => move.Name).ToList(),
                SpriteIdentity.From(preview),
                legality.Legal,
                legality.Summary,
                consequences));
        return SpeciesFormProjectionResult.Success(projection);
    }

    private static SlotMutationResult ApplySpeciesFormEdit(
        SaveFile save,
        PKM pokemon,
        ushort speciesId,
        byte form)
    {
        if (speciesId == 0 || speciesId > pokemon.MaxSpeciesID || !save.Personal.IsSpeciesInGame(speciesId))
            return SlotMutationResult.Fail(
                "unsupported-pokemon-edit",
                $"Species {speciesId} is not supported by this Pokemon format and Save File.");

        if (!save.Personal.IsPresentInGame(speciesId, form))
            return SlotMutationResult.Fail(
                "unsupported-pokemon-edit",
                $"Form {form} is not supported for {PokemonName(speciesId)} in this Save File.");

        if (pokemon.Species == speciesId && pokemon.Form == form)
            return SlotMutationResult.Success(false);

        var wasNicknamed = pokemon.IsNicknamed;
        var currentLevel = Experience.ClampLevel(pokemon.CurrentLevel);
        var abilityIndex = pokemon.AbilityNumber switch
        {
            2 => 1,
            4 => 2,
            _ => 0,
        };

        pokemon.Species = speciesId;
        pokemon.Form = form;
        pokemon.RefreshAbility(Math.Min(abilityIndex, Math.Max(0, pokemon.PersonalInfo.AbilityCount - 1)));
        pokemon.Gender = pokemon.GetSaneGender();
        // Re-anchor experience so a growth-rate change keeps the pre-edit level.
        pokemon.EXP = Experience.GetEXP(currentLevel, pokemon.PersonalInfo.EXPGrowth);
        if (!wasNicknamed)
            pokemon.ClearNickname();

        return SlotMutationResult.Success(true);
    }

    private static string LegalityEditFailurePrefix(PokemonEditOperationRequest operation)
    {
        if (operation.MetData is not null && operation.OriginalTrainer is not null)
            return "Pokemon edit is not valid for this Pokemon Entity.";

        return operation.MetData is not null
            ? "Met Data edit is not valid for this Pokemon encounter."
            : "Original Trainer data is not valid for this Pokemon Entity.";
    }

    private static SlotMutationResult ApplyOriginalTrainerEdit(PKM pokemon, PokemonOriginalTrainerEdit edit)
    {
        var constraints = SlotDetailProjection.OriginalTrainerEditConstraints(pokemon);
        if (!constraints.Supported)
            return SlotMutationResult.Fail(
                "unsupported-pokemon-edit",
                constraints.UnsupportedReason ?? "Original Trainer Data Editing is not supported for this Pokemon Entity format.");

        if (string.IsNullOrWhiteSpace(edit.Name))
            return SlotMutationResult.Fail("invalid-pokemon-edit", "Original Trainer name is required.");
        if (edit.Name.Length > constraints.MaxNameLength)
            return SlotMutationResult.Fail(
                "invalid-pokemon-edit",
                $"Original Trainer name must be {constraints.MaxNameLength} characters or fewer.");
        if (edit.TrainerId < constraints.MinTrainerId || edit.TrainerId > constraints.MaxTrainerId)
            return SlotMutationResult.Fail(
                "invalid-pokemon-edit",
                $"Trainer ID must be between {constraints.MinTrainerId} and {constraints.MaxTrainerId}.");
        if (edit.SecretId is int secretId &&
            (!constraints.SupportsSecretId || secretId < constraints.MinTrainerId || secretId > constraints.MaxTrainerId))
            return SlotMutationResult.Fail(
                constraints.SupportsSecretId ? "invalid-pokemon-edit" : "unsupported-pokemon-edit",
                constraints.SupportsSecretId
                    ? $"Secret ID must be between {constraints.MinTrainerId} and {constraints.MaxTrainerId}."
                    : "Secret ID editing is not supported by this Pokemon Entity format.");
        if (edit.GenderId is int genderId &&
            (!constraints.SupportsGender || constraints.Genders.All(option => option.Id != genderId)))
            return SlotMutationResult.Fail(
                constraints.SupportsGender ? "invalid-pokemon-edit" : "unsupported-pokemon-edit",
                constraints.SupportsGender
                    ? "Original Trainer gender choice is invalid."
                    : "Original Trainer gender editing is not supported by this Pokemon Entity format.");
        if (edit.LanguageId is int languageId &&
            (!constraints.SupportsLanguage || constraints.Languages.All(option => option.Id != languageId)))
            return SlotMutationResult.Fail(
                constraints.SupportsLanguage ? "invalid-pokemon-edit" : "unsupported-pokemon-edit",
                constraints.SupportsLanguage
                    ? "Pokemon language choice is invalid."
                    : "Pokemon language editing is not supported by this Pokemon Entity format.");

        if (edit.LanguageId is int nextLanguage)
            pokemon.Language = nextLanguage;

        try
        {
            pokemon.OriginalTrainerName = edit.Name;
        }
        catch (Exception ex)
        {
            return SlotMutationResult.Fail("invalid-pokemon-edit", ex.Message);
        }

        if (!StringComparer.Ordinal.Equals(pokemon.OriginalTrainerName, edit.Name))
            return SlotMutationResult.Fail(
                "invalid-pokemon-edit",
                "Original Trainer name contains characters that are not valid for this Pokemon format or language.");

        pokemon.TID16 = (ushort)edit.TrainerId;
        if (edit.SecretId is int nextSecretId)
            pokemon.SID16 = (ushort)nextSecretId;
        if (edit.GenderId is int nextGender)
            pokemon.OriginalTrainerGender = (byte)nextGender;

        return SlotMutationResult.Success(true);
    }

    private static List<PokemonFormOption> GetFormOptions(
        SaveFile save,
        EntityContext context,
        ushort speciesId)
    {
        var names = FormConverter.GetFormList(
            speciesId,
            GameInfo.Strings.Types,
            GameInfo.Strings.forms,
            GameInfo.GenderSymbolUnicode,
            context);
        var forms = new List<PokemonFormOption>();
        for (byte form = 0; form < names.Length; form++)
        {
            if (!save.Personal.IsPresentInGame(speciesId, form))
                continue;

            forms.Add(new PokemonFormOption(
                form,
                string.IsNullOrWhiteSpace(names[form]) ? (form == 0 ? "Default" : $"Form {form}") : names[form]));
        }

        if (forms.Count == 0 && save.Personal.IsPresentInGame(speciesId, 0))
            forms.Add(new PokemonFormOption(0, "Default"));
        return forms;
    }

    private static List<string> CreateSpeciesFormConsequences(
        PKM source,
        PKM preview,
        IReadOnlyList<PokemonFormOption> forms,
        LegalityReport legality)
    {
        var consequences = new List<string>();
        if (source.Species != preview.Species || source.Form != preview.Form)
            consequences.Add($"Species identity changes to {PokemonName(preview.Species)} ({FormName(forms, preview.Form)}).");
        if (source.Ability != preview.Ability)
            consequences.Add($"Ability updates from {SlotDetailProjection.Ability(source) ?? "None"} to {SlotDetailProjection.Ability(preview) ?? "None"}.");
        if (source.Gender != preview.Gender)
            consequences.Add($"Gender updates from {SlotDetailProjection.Gender(source) ?? "None"} to {SlotDetailProjection.Gender(preview) ?? "None"}.");
        if (!StringComparer.Ordinal.Equals(source.Nickname, preview.Nickname))
            consequences.Add($"Default nickname updates to {preview.Nickname}.");

        var sourceTypes = SlotDetailProjection.Types(source).Select(type => type.Name);
        var previewTypes = SlotDetailProjection.Types(preview).Select(type => type.Name);
        if (!sourceTypes.SequenceEqual(previewTypes))
            consequences.Add($"Types update to {string.Join(" / ", previewTypes)}.");
        if (!SlotDetailProjection.Stats(source).Select(stat => stat.Value)
            .SequenceEqual(SlotDetailProjection.Stats(preview).Select(stat => stat.Value)))
            consequences.Add("Projected stats update for the selected species and form.");
        if (SlotDetailProjection.Moves(source).Count > 0)
            consequences.Add("Move Set is retained and re-evaluated by the PKHeX legality engine.");

        consequences.Add("Evolution identity and Sprite Identity update; Met Data and Original Trainer Data remain unchanged.");
        consequences.Add(legality.Summary);
        return consequences;
    }

    private static string PokemonName(ushort speciesId) =>
        speciesId < GameInfo.Strings.Species.Count && !string.IsNullOrWhiteSpace(GameInfo.Strings.Species[speciesId])
            ? GameInfo.Strings.Species[speciesId]
            : $"Species {speciesId}";

    private static string FormName(IReadOnlyList<PokemonFormOption> forms, byte form) =>
        forms.FirstOrDefault(option => option.Id == form)?.Name ?? (form == 0 ? "Default" : $"Form {form}");

    private static SlotMutationResult ApplyMetDataEdit(PKM pokemon, PokemonMetDataEdit edit)
    {
        var constraints = SlotDetailProjection.MetDataEditConstraints(pokemon);
        if (!constraints.Supported)
            return SlotMutationResult.Fail(
                "unsupported-pokemon-edit",
                constraints.UnsupportedReason ?? "Met Data Editing is not supported for this Pokemon Entity format.");

        var originGameId = edit.OriginGameId ?? constraints.CurrentOriginGameId;
        if (constraints.SupportsOriginGame && constraints.OriginGames.All(option => option.Id != originGameId))
            return SlotMutationResult.Fail("invalid-pokemon-edit", $"Origin game {originGameId} is not supported by this Pokemon Entity format.");

        var locationGroup = constraints.LocationGroups.Find(group => group.OriginGameId == originGameId);
        if (locationGroup is null || locationGroup.Options.All(option => option.Id != edit.LocationId))
            return SlotMutationResult.Fail(
                "invalid-pokemon-edit",
                $"Met location {edit.LocationId} is not available for the selected origin game.");

        if (edit.MetLevel < constraints.MinMetLevel || edit.MetLevel > constraints.MaxMetLevel)
            return SlotMutationResult.Fail(
                "invalid-pokemon-edit",
                $"Met level must be between {constraints.MinMetLevel} and {constraints.MaxMetLevel}.");

        if (edit.OriginGameId is int requestedOriginGameId)
        {
            if (!constraints.SupportsOriginGame)
                return SlotMutationResult.Fail("unsupported-pokemon-edit", "Origin game editing is not supported by this Pokemon Entity format.");
            pokemon.Version = (GameVersion)requestedOriginGameId;
        }

        if (edit.BallId is int ballId)
        {
            if (!constraints.SupportsBall)
                return SlotMutationResult.Fail("unsupported-pokemon-edit", "Ball editing is not supported by this Pokemon Entity format.");
            if (constraints.Balls.All(option => option.Id != ballId))
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"Ball {ballId} is not supported by this Pokemon Entity format.");
            pokemon.Ball = (byte)ballId;
            if (pokemon.Ball != ballId)
                return SlotMutationResult.Fail("unsupported-pokemon-edit", $"Ball {ballId} cannot be stored by this Pokemon Entity format.");
        }

        if (constraints.SupportsMetDate)
        {
            if (edit.MetDate is not null &&
                (!DateOnly.TryParseExact(edit.MetDate, "yyyy-MM-dd", out var metDate) ||
                 metDate.Year is < 2000 or > 2255))
                return SlotMutationResult.Fail("invalid-pokemon-edit", "Met date must use YYYY-MM-DD and be between 2000 and 2255.");
            pokemon.MetDate = edit.MetDate is null ? null : DateOnly.ParseExact(edit.MetDate, "yyyy-MM-dd");
        }
        else if (edit.MetDate is not null)
        {
            return SlotMutationResult.Fail("unsupported-pokemon-edit", "Met date editing is not supported by this Pokemon Entity format.");
        }

        pokemon.MetLocation = (ushort)edit.LocationId;
        pokemon.MetLevel = (byte)edit.MetLevel;
        return SlotMutationResult.Success(true);
    }

    private static List<LegalityReportLine> InvalidLegalityMessages(PKM pokemon, StorageSlotType storageSlotType) =>
        CreateLegalityMessages(new LegalityAnalysis(pokemon, storageSlotType), includeGeneric: true)
            .Where(message => !StringComparer.Ordinal.Equals(message.Severity, Severity.Valid.ToString()))
            .ToList();

    private static string LegalityMessageKey(LegalityReportLine message) =>
        $"{message.Severity}|{message.Identifier}|{message.Message}";

    private static SlotMutationResult CreatePokemon(SaveFile save, PokemonCreationRequest operation)
    {
        var destinationResult = SlotRef.From(save, operation.Destination);
        if (!destinationResult.Ok)
            return SlotMutationResult.Fail(destinationResult.Code, destinationResult.Message);

        var destination = destinationResult.Value;
        if (destination.Get(save).Species != 0)
            return SlotMutationResult.Fail("occupied-destination-slot", "Create Pokemon needs an empty destination Slot.");

        if (operation.Level is < Experience.MinLevel or > Experience.MaxLevel)
            return SlotMutationResult.Fail(
                "invalid-pokemon-creation",
                $"Level must be between {Experience.MinLevel} and {Experience.MaxLevel}.");

        var pokemon = save.BlankPKM;
        EntityTemplates.TemplateFields(pokemon, save);
        var species = operation.SpeciesId ?? pokemon.Species;
        if (species == 0 || species > pokemon.MaxSpeciesID || !save.Personal.IsPresentInGame(species, 0))
        {
            return SlotMutationResult.Fail(
                "unsupported-pokemon-creation",
                operation.SpeciesId is null
                    ? "This Save File does not provide compatible Create Pokemon defaults."
                    : $"Species {species} is not supported by this Save File.");
        }

        pokemon.Species = species;
        pokemon.Form = 0;
        pokemon.CurrentLevel = (byte)operation.Level;
        pokemon.Gender = pokemon.GetSaneGender();
        pokemon.RefreshAbility(0);
        pokemon.ClearNickname();
        // A blank template carries no moves, so seed the suggested level-up Move Set.
        Span<ushort> moves = stackalloc ushort[4];
        pokemon.GetMoveSet(moves);
        pokemon.SetMoves(moves);
        pokemon.SetMaximumPPCurrent(moves);
        pokemon.RefreshChecksum();
        if (pokemon.PartyStatsPresent)
            pokemon.ResetPartyStats();

        destination.Set(save, pokemon);
        return SlotMutationResult.Success(true);
    }

    private static int[] StatEditSetToArray(PokemonStatEditSet edits) =>
        [edits.HP, edits.ATK, edits.DEF, edits.SPE, edits.SPA, edits.SPD];

    private static (byte? Original, byte? Override) TeraTypeState(PKM pokemon) =>
        pokemon is ITeraType tera
            ? ((byte)tera.TeraTypeOriginal, (byte)tera.TeraTypeOverride)
            : (null, null);

    private static SlotMutationResult ApplyFriendshipEdits(PKM pokemon, List<PokemonFriendshipFieldEdit> edits)
    {
        if (edits.Count == 0)
            return SlotMutationResult.Fail("invalid-pokemon-edit", "Choose a Friendship edit to apply.");

        var constraints = SlotDetailProjection.FriendshipEditConstraints(pokemon);
        if (!constraints.Supported)
            return SlotMutationResult.Fail(
                "unsupported-pokemon-edit",
                constraints.UnsupportedReason ?? "Friendship Editing is not supported for this Pokemon format.");

        var fields = constraints.Fields.ToDictionary(field => field.Key, StringComparer.Ordinal);
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var edit in edits)
        {
            if (!keys.Add(edit.Key))
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"Friendship field '{edit.Key}' is duplicated.");
            if (!fields.TryGetValue(edit.Key, out var field))
                return SlotMutationResult.Fail("unsupported-pokemon-edit", $"Friendship field '{edit.Key}' is not supported by this Pokemon format.");
            if (edit.Value < field.Min || edit.Value > field.Max)
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"{field.Label} must be between {field.Min} and {field.Max}.");

            switch (edit.Key)
            {
                case "friendship":
                case "hatch-counter":
                    pokemon.CurrentFriendship = (byte)edit.Value;
                    break;
                case "affection" when pokemon is IAffection affection:
                    if (pokemon.CurrentHandler == 0)
                        affection.OriginalTrainerAffection = (byte)edit.Value;
                    else
                        affection.HandlingTrainerAffection = (byte)edit.Value;
                    break;
                default:
                    return SlotMutationResult.Fail("unsupported-pokemon-edit", $"Friendship field '{edit.Key}' is not supported by this Pokemon format.");
            }
        }

        return SlotMutationResult.Success(true);
    }

    private static int? CurrentAffection(PKM pokemon) =>
        pokemon is not IAffection affection
            ? null
            : pokemon.CurrentHandler == 0
                ? affection.OriginalTrainerAffection
                : affection.HandlingTrainerAffection;

    private static SlotMutationResult ApplyMoveSetEdits(PKM pokemon, List<PokemonMoveSlotEdit> edits, StorageSlotType storageSlotType)
    {
        var moves = new[] { pokemon.Move1, pokemon.Move2, pokemon.Move3, pokemon.Move4 };
        var pp = new[] { pokemon.Move1_PP, pokemon.Move2_PP, pokemon.Move3_PP, pokemon.Move4_PP };
        var ppUps = new[] { pokemon.Move1_PPUps, pokemon.Move2_PPUps, pokemon.Move3_PPUps, pokemon.Move4_PPUps };
        var changedEdits = new List<PokemonMoveSlotEdit>();
        var legalMoves = new LegalMoveInfo();
        legalMoves.ReloadMoves(new LegalityAnalysis(pokemon, storageSlotType));

        foreach (var edit in edits)
        {
            if (edit.Slot < 0 || edit.Slot >= moves.Length)
                return SlotMutationResult.Fail("invalid-pokemon-edit", "Move Set slot must be between 1 and 4.");

            if (edit.Move > pokemon.MaxMoveID || (edit.Move != 0 && MoveInfo.IsDummiedMove(pokemon, edit.Move)))
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"Move {edit.Move} is not supported by this Pokemon format.");

            if (edit.Move != 0 && !legalMoves.CanLearn(edit.Move))
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"{MoveName(edit.Move)} is not available for this Pokemon.");

            var nextPpUps = edit.PpUps ?? ppUps[edit.Slot];
            if (nextPpUps < 0 || nextPpUps > 3)
                return SlotMutationResult.Fail("invalid-pokemon-edit", "PP Ups must be between 0 and 3.");

            var maxPp = edit.Move == 0 ? 0 : pokemon.GetMovePP(edit.Move, nextPpUps);
            var nextPp = edit.Pp ?? maxPp;
            if (nextPp < 0 || nextPp > maxPp)
                return SlotMutationResult.Fail("invalid-pokemon-edit", $"PP for {MoveName(edit.Move)} must be between 0 and {maxPp}.");

            if (moves[edit.Slot] != edit.Move || ppUps[edit.Slot] != nextPpUps || pp[edit.Slot] != nextPp)
                changedEdits.Add(edit);

            moves[edit.Slot] = edit.Move;
            ppUps[edit.Slot] = edit.Move == 0 ? 0 : nextPpUps;
            pp[edit.Slot] = edit.Move == 0 ? 0 : nextPp;
        }

        pokemon.SetMoves(moves);
        pokemon.Move1_PPUps = ppUps[0];
        pokemon.Move2_PPUps = ppUps[1];
        pokemon.Move3_PPUps = ppUps[2];
        pokemon.Move4_PPUps = ppUps[3];
        pokemon.Move1_PP = pp[0];
        pokemon.Move2_PP = pp[1];
        pokemon.Move3_PP = pp[2];
        pokemon.Move4_PP = pp[3];

        var analysis = new LegalityAnalysis(pokemon, storageSlotType);
        if (!analysis.Valid)
            return SlotMutationResult.Fail(
                "invalid-pokemon-edit",
                CreateIllegalMoveSetMessage(analysis, changedEdits.Count == 0 ? edits : changedEdits));

        return SlotMutationResult.Success(true);
    }

    private static string CreateIllegalMoveSetMessage(LegalityAnalysis analysis, List<PokemonMoveSlotEdit> edits)
    {
        var details = CreateLegalityMessages(analysis, includeGeneric: true)
            .Where(message => !StringComparer.Ordinal.Equals(message.Severity, Severity.Valid.ToString()))
            .Select(message => message.Message)
            .Distinct(StringComparer.Ordinal)
            .Take(3)
            .ToList();
        if (details.Count == 0)
        {
            var editedMoves = string.Join(", ", edits.Select(edit => $"Move {edit.Slot + 1} {MoveName(edit.Move)}"));
            return "Move Set edit makes this Pokemon illegal for its current format. PKHeX did not return a more specific legality reason."
                + (string.IsNullOrWhiteSpace(editedMoves) ? "" : $" Edited moves: {editedMoves}.");
        }

        var changedMoveLabels = string.Join(", ", edits.Select(edit => $"Move {edit.Slot + 1} {MoveName(edit.Move)}"));
        return $"Move Set edit makes this Pokemon illegal for its current format. {string.Join(" ", details)}"
            + (string.IsNullOrWhiteSpace(changedMoveLabels) ? "" : $" Edited moves: {changedMoveLabels}.");
    }

    private static string MoveName(ushort move) =>
        move == 0 ? "Empty" : (move >= 0 && move < GameInfo.Strings.Move.Count ? GameInfo.Strings.Move[move] : $"Move {move}");

    private static SlotMutationResult ImportStoredPokemon(SaveFile save, StoredPokemonImportRequest request)
    {
        var destinationResult = SlotRef.From(save, request.Destination);
        if (!destinationResult.Ok)
            return SlotMutationResult.Fail(destinationResult.Code, destinationResult.Message);

        var destination = destinationResult.Value;
        if (destination.Get(save).Species != 0)
            return SlotMutationResult.Fail("occupied-destination-slot", "Moving from Pokemon Storage needs an empty destination Slot.");

        PKM? pokemon;
        try
        {
            pokemon = EntityFormat.GetFromBytes(Convert.FromBase64String(request.EntityBytesBase64), save.Context);
        }
        catch (Exception ex)
        {
            return SlotMutationResult.Fail("invalid-stored-pokemon", ex.Message);
        }

        if (pokemon is null || pokemon.Species == 0)
            return SlotMutationResult.Fail("invalid-stored-pokemon", "Pokemon Storage entry is missing entity data.");

        var target = save.BlankPKM;
        if (pokemon.Format != target.Format)
        {
            if (!EntityConverter.TryMakePKMCompatible(pokemon, target, out var result, out var converted))
                return SlotMutationResult.Fail("incompatible-stored-pokemon", result.GetDisplayString(pokemon, target.GetType()));

            pokemon = converted;
        }

        destination.Set(save, pokemon);
        return SlotMutationResult.Success(true);
    }

    private static SlotMutationResult ApplyMove(SaveFile save, SlotRef source, SaveSlotRef? destinationRef)
    {
        var destinationResult = SlotRef.From(save, destinationRef);
        if (!destinationResult.Ok)
            return SlotMutationResult.Fail(destinationResult.Code, destinationResult.Message);

        var destination = destinationResult.Value;
        if (source.Equals(destination))
            return SlotMutationResult.Success(false);

        var sourcePokemon = source.Get(save).Clone();
        var destinationPokemon = destination.Get(save).Clone();
        var destinationOccupied = destinationPokemon.Species != 0;

        if (source.Zone == SlotZone.Party && !destinationOccupied)
            source.Clear(save);
        else
            source.Set(save, destinationOccupied ? destinationPokemon : save.BlankPKM);

        destination.Set(save, sourcePokemon);
        return SlotMutationResult.Success(true);
    }

    private static SlotMutationResult ApplyCopy(SaveFile save, SlotRef source, SaveSlotRef? destinationRef)
    {
        var destinationResult = SlotRef.From(save, destinationRef);
        if (!destinationResult.Ok)
            return SlotMutationResult.Fail(destinationResult.Code, destinationResult.Message);

        var destination = destinationResult.Value;
        if (source.Equals(destination))
            return SlotMutationResult.Success(false);

        var destinationPokemon = destination.Get(save);
        if (destinationPokemon.Species != 0)
            return SlotMutationResult.Fail("occupied-destination-slot", "Copy needs an empty destination Slot.");

        destination.Set(save, source.Get(save).Clone());
        return SlotMutationResult.Success(true);
    }

    private static SlotMutationResult ApplyClear(SaveFile save, SlotRef source)
    {
        source.Clear(save);
        return SlotMutationResult.Success(true);
    }

    private static LegalityReport CreateLegalityReport(PKM pokemon, StorageSlotType storageSlotType)
    {
        var analysis = new LegalityAnalysis(pokemon, storageSlotType);
        var messages = CreateLegalityMessages(analysis, includeGeneric: false);

        var warnings = messages
            .Where(message => !StringComparer.Ordinal.Equals(message.Severity, Severity.Valid.ToString()))
            .ToList();
        var legal = analysis.Valid;
        var judgement = legal ? "Legal" : "Illegal";
        var summary = legal
            ? "PKHeX judged this Pokemon legal."
            : "PKHeX found legality issues for this Pokemon.";

        return new LegalityReport(
            legal,
            judgement,
            summary,
            GetFixableProblems(analysis),
            warnings,
            messages);
    }

    private static PokemonActionPreview CreatePokemonActionPreview(
        PKM pokemon,
        StorageSlotType storageSlotType)
    {
        var legalityFix = PreviewLegalityFix(pokemon, storageSlotType);
        var evolutionChoices = CreateEvolutionChoices(pokemon);
        var evolve = evolutionChoices.Count > 0
            ? new PokemonActionAvailability("evolve", true, null, [], evolutionChoices, [])
            : new PokemonActionAvailability(
                "evolve",
                false,
                pokemon.IsEgg
                    ? "Eggs cannot evolve."
                    : "No direct evolution is available for this Pokemon.",
                [],
                [],
                []);

        return new PokemonActionPreview(
            CreateLegalityReport(pokemon, storageSlotType),
            [legalityFix, evolve]);
    }

    private static PokemonActionAvailability PreviewLegalityFix(
        PKM pokemon,
        StorageSlotType storageSlotType)
    {
        var fixes = CreateLegalityFixChoices(pokemon, storageSlotType);
        var clone = pokemon.Clone();
        var result = ApplyTargetedLegalityFix(clone, storageSlotType, null);
        return fixes.Count > 0
            ? new PokemonActionAvailability("legality-fix", true, null, result.Changes, [], fixes)
            : new PokemonActionAvailability(
                "legality-fix",
                false,
                "The Legality Report has no supported fixable problems.",
                [],
                [],
                []);
    }

    private static List<PokemonLegalityFixChoice> CreateLegalityFixChoices(
        PKM pokemon,
        StorageSlotType storageSlotType)
    {
        var fixes = new List<PokemonLegalityFixChoice>();
        foreach (var (id, label) in new[]
        {
            ("move-set", "Move Set"),
            ("relearn-moves", "Relearn Moves"),
            ("ball", "Ball"),
            ("ribbons", "Ribbons"),
        })
        {
            var clone = pokemon.Clone();
            var result = ApplyTargetedLegalityFix(clone, storageSlotType, id);
            if (result.Changes.Count > 0)
            {
                var token = CacheLegalityFixPreview(
                    pokemon,
                    storageSlotType,
                    id,
                    result.Pokemon,
                    result.Changes);
                fixes.Add(new PokemonLegalityFixChoice(id, token, label, result.Changes));
            }
        }

        return fixes;
    }

    private static PokemonActionMutation ApplyPokemonAction(
        PKM pokemon,
        StorageSlotType storageSlotType,
        string kind,
        string? choiceId)
    {
        switch (kind)
        {
            case "legality-fix":
                {
                    var fix = choiceId is null
                        ? ApplyTargetedLegalityFix(pokemon, storageSlotType, null)
                        : ApplyCachedLegalityFix(pokemon, storageSlotType, choiceId);
                    if (!fix.Ok)
                        return fix;
                    return fix.Changes.Count == 0
                        ? PokemonActionMutation.Fail(
                            "unsupported-pokemon-action",
                            "The Legality Report has no supported fixable problems.")
                        : PokemonActionMutation.Success(fix.Pokemon, fix.Changes);
                }
            case "evolve":
                {
                    if (string.IsNullOrWhiteSpace(choiceId))
                        return PokemonActionMutation.Fail(
                            "invalid-pokemon-action",
                            "Choose an evolution before applying.");

                    var method = DirectEvolutionMethods(pokemon)
                        .FirstOrDefault(candidate => EvolutionChoiceId(candidate, pokemon.Form) == choiceId);
                    if (method.Species == 0)
                        return PokemonActionMutation.Fail(
                            "invalid-pokemon-action",
                            "The selected evolution is no longer available.");

                    var before = pokemon.Clone();
                    ApplyEvolution(pokemon, method);
                    return PokemonActionMutation.Success(
                        pokemon,
                        DescribePokemonChanges(before, pokemon));
                }
            default:
                return PokemonActionMutation.Fail(
                    "unsupported-pokemon-action",
                    $"Pokemon Action '{kind}' is not supported.");
        }
    }

    private static string CacheLegalityFixPreview(
        PKM source,
        StorageSlotType storageSlotType,
        string fixId,
        PKM result,
        List<PokemonActionChange> changes)
    {
        var token = $"{fixId}:{Guid.NewGuid():N}";
        var preview = new LegalityFixPreview(
            source.Data.ToArray(),
            source.GetType(),
            storageSlotType,
            fixId,
            result.Clone(),
            changes);
        lock (LegalityFixPreviewCacheLock)
        {
            LegalityFixPreviewCache[token] = preview;
            LegalityFixPreviewOrder.Enqueue(token);
            while (LegalityFixPreviewOrder.Count > LegalityFixPreviewCacheCapacity)
                LegalityFixPreviewCache.Remove(LegalityFixPreviewOrder.Dequeue());
        }
        return token;
    }

    private static PokemonActionMutation ApplyCachedLegalityFix(
        PKM pokemon,
        StorageSlotType storageSlotType,
        string token)
    {
        LegalityFixPreview? preview;
        lock (LegalityFixPreviewCacheLock)
            LegalityFixPreviewCache.TryGetValue(token, out preview);

        if (preview is null || !token.StartsWith($"{preview.FixId}:", StringComparison.Ordinal))
        {
            return PokemonActionMutation.Fail(
                "unsupported-pokemon-action",
                "This Quick Fix preview is no longer available. Refresh the Legality Report and try again.");
        }

        if (preview.StorageSlotType != storageSlotType ||
            preview.PokemonType != pokemon.GetType() ||
            !preview.SourceBytes.AsSpan().SequenceEqual(pokemon.Data))
        {
            return PokemonActionMutation.Fail(
                "stale-pokemon-action-preview",
                "This Pokemon changed after the Quick Fix preview. Refresh the Legality Report and try again.");
        }

        return PokemonActionMutation.Success(preview.Pokemon.Clone(), preview.Changes);
    }

    private static PokemonActionMutation ApplyTargetedLegalityFix(
        PKM pokemon,
        StorageSlotType storageSlotType,
        string? fixId)
    {
        var before = pokemon.Clone();
        var analysis = new LegalityAnalysis(pokemon, storageSlotType);

        if ((fixId is null or "move-set") &&
            (!MoveResult.AllValid(analysis.Info.Moves) ||
             analysis.Results.Any(result =>
                 !result.Valid && result.Identifier == CheckIdentifier.CurrentMove)))
        {
            pokemon.SetMoveset();
            if (pokemon is ITechRecord records)
            {
                records.ClearRecordFlags();
                var refreshed = new LegalityAnalysis(pokemon, storageSlotType);
                records.SetRecordFlags(
                    pokemon,
                    TechnicalRecordApplicatorOption.LegalCurrent,
                    refreshed);
            }

            // Later applicators must see the post-moveset state, per PKHeX convention.
            analysis = new LegalityAnalysis(pokemon, storageSlotType);
        }

        if ((fixId is null or "relearn-moves") &&
            (!MoveResult.AllValid(analysis.Info.Relearn) ||
             analysis.Results.Any(result =>
                 !result.Valid && result.Identifier == CheckIdentifier.RelearnMove)))
        {
            pokemon.SetRelearnMoves(analysis);
            analysis = new LegalityAnalysis(pokemon, storageSlotType);
        }

        if ((fixId is null or "ball") && analysis.Results.Any(result =>
            !result.Valid && result.Identifier == CheckIdentifier.Ball))
        {
            BallApplicator.ApplyBallLegalByColor(
                pokemon,
                analysis,
                PersonalColorUtil.GetColor(pokemon));
            analysis = new LegalityAnalysis(pokemon, storageSlotType);
        }

        if ((fixId is null or "ribbons") && analysis.Results.Any(result =>
            !result.Valid &&
            result.Identifier is CheckIdentifier.Ribbon or CheckIdentifier.RibbonMark))
        {
            var args = new RibbonVerifierArguments(
                pokemon,
                analysis.EncounterMatch,
                analysis.Info.EvoChainsAllGens);
            RibbonApplicator.FixInvalidRibbons(in args);
        }

        if (pokemon.PartyStatsPresent)
            pokemon.ResetPartyStats();
        pokemon.RefreshChecksum();
        return PokemonActionMutation.Success(pokemon, DescribePokemonChanges(before, pokemon));
    }

    private static List<string> GetFixableProblems(LegalityAnalysis analysis)
    {
        var result = new List<string>();
        if (
            !MoveResult.AllValid(analysis.Info.Moves) ||
            analysis.Results.Any(check =>
                !check.Valid && check.Identifier == CheckIdentifier.CurrentMove))
        {
            result.Add("Move Set");
        }

        if (
            !MoveResult.AllValid(analysis.Info.Relearn) ||
            analysis.Results.Any(check =>
                !check.Valid && check.Identifier == CheckIdentifier.RelearnMove))
        {
            result.Add("Relearn Moves");
        }

        if (analysis.Results.Any(check =>
            !check.Valid && check.Identifier == CheckIdentifier.Ball))
        {
            result.Add("Ball");
        }

        if (analysis.Results.Any(check =>
            !check.Valid &&
            check.Identifier is CheckIdentifier.Ribbon or CheckIdentifier.RibbonMark))
        {
            result.Add("Ribbons");
        }

        return result;
    }

    private static List<PokemonEvolutionChoice> CreateEvolutionChoices(PKM pokemon)
    {
        if (pokemon.IsEgg)
            return [];

        var result = new List<PokemonEvolutionChoice>();
        foreach (var method in DirectEvolutionMethods(pokemon))
        {
            var evolved = pokemon.Clone();
            ApplyEvolution(evolved, method);
            result.Add(new PokemonEvolutionChoice(
                EvolutionChoiceId(method, pokemon.Form),
                method.Species,
                method.GetDestinationForm(pokemon.Form),
                SpeciesName(method.Species),
                method.Method.ToString(),
                EvolutionRequirement(method),
                DescribePokemonChanges(pokemon, evolved)));
        }

        return result;
    }

    private static List<EvolutionMethod> DirectEvolutionMethods(PKM pokemon)
    {
        if (pokemon.IsEgg)
            return [];

        var methods = EvolutionTree
            .GetEvolutionTree(pokemon.Context)
            .Forward
            .GetForward(pokemon.Species, pokemon.Form);
        var hasContestStats = pokemon is IContestStats;
        return
        [
            .. methods.Span
                .ToArray()
                .Where(method =>
                    method.Species != 0 &&
                    method.Method != EvolutionType.LevelUpShedinja &&
                    (method.Method != EvolutionType.LevelUpBeauty || hasContestStats))
                .OrderBy(method => method.Species)
                .ThenBy(method => method.Form)
        ];
    }

    private static void ApplyEvolution(PKM pokemon, EvolutionMethod method)
    {
        var wasNicknamed = pokemon.IsNicknamed;
        if (method.Method == EvolutionType.LevelUpBeauty &&
            pokemon is IContestStats contest &&
            contest.ContestBeauty < method.Argument)
        {
            contest.ContestBeauty = (byte)method.Argument;
        }

        if (method.Level > 0 && pokemon.CurrentLevel < method.Level)
            pokemon.CurrentLevel = method.Level;

        if (
            method.Method.IsLevelUpRequired &&
            pokemon.CurrentLevel <= pokemon.MetLevel &&
            pokemon.CurrentLevel < Experience.MaxLevel)
        {
            pokemon.CurrentLevel = (byte)Math.Min(Experience.MaxLevel, pokemon.MetLevel + 1);
        }

        pokemon.Species = method.Species;
        pokemon.Form = method.GetDestinationForm(pokemon.Form);
        pokemon.Gender = pokemon.GetSaneGender();
        var abilityIndex = pokemon.AbilityNumber switch
        {
            2 => 1,
            4 => 2,
            _ => 0,
        };
        pokemon.RefreshAbility(abilityIndex);
        if (!wasNicknamed)
            pokemon.ClearNickname();
        if (pokemon.PartyStatsPresent)
            pokemon.ResetPartyStats();
        pokemon.RefreshChecksum();
    }

    private static List<PokemonActionChange> DescribePokemonChanges(PKM before, PKM after)
    {
        var changes = new List<PokemonActionChange>();
        AddChange(changes, "Species", SpeciesName(before.Species), SpeciesName(after.Species));
        AddChange(changes, "Form", before.Form.ToString(), after.Form.ToString());
        AddChange(changes, "Level", before.CurrentLevel.ToString(), after.CurrentLevel.ToString());
        AddChange(changes, "Nickname", before.Nickname, after.Nickname);
        AddChange(changes, "Ability", AbilityName(before.Ability), AbilityName(after.Ability));
        AddChange(changes, "Ball", before.Ball.ToString(), after.Ball.ToString());
        AddChange(changes, "Moves", MovesLabel(before), MovesLabel(after));
        AddChange(changes, "Relearn Moves", RelearnMovesLabel(before), RelearnMovesLabel(after));
        AddChange(changes, "Ribbons", RibbonCount(before).ToString(), RibbonCount(after).ToString());
        return changes;
    }

    private static void AddChange(
        List<PokemonActionChange> changes,
        string field,
        string before,
        string after)
    {
        if (!StringComparer.Ordinal.Equals(before, after))
            changes.Add(new PokemonActionChange(field, before, after));
    }

    private static string EvolutionChoiceId(EvolutionMethod method, byte sourceForm) =>
        $"{method.Species}:{method.GetDestinationForm(sourceForm)}:{(int)method.Method}:{method.Argument}:{method.Level}";

    private static string EvolutionRequirement(EvolutionMethod method)
    {
        if (method.Level > 0)
            return $"Level {method.Level}";
        if (method.Argument > 0)
            return $"{method.Method} ({method.Argument})";
        return method.Method.ToString();
    }

    private static string SpeciesName(ushort species) =>
        species < GameInfo.Strings.Species.Count && !string.IsNullOrWhiteSpace(GameInfo.Strings.Species[species])
            ? GameInfo.Strings.Species[species]
            : $"Species {species}";

    private static string AbilityName(int ability) =>
        ability >= 0 && ability < GameInfo.Strings.Ability.Count
            ? GameInfo.Strings.Ability[ability]
            : $"Ability {ability}";

    private static string MovesLabel(PKM pokemon) =>
        string.Join(", ", new[] { pokemon.Move1, pokemon.Move2, pokemon.Move3, pokemon.Move4 }
            .Where(move => move != 0)
            .Select(MoveName));

    private static string RelearnMovesLabel(PKM pokemon) =>
        string.Join(", ", pokemon.RelearnMoves
            .Where(move => move != 0)
            .Select(MoveName));

    private static int RibbonCount(PKM pokemon) =>
        RibbonInfo.GetRibbonInfo(pokemon).Count(ribbon => ribbon.HasRibbon);

    private static PKM? ParseStoredPokemon(string entityBytesBase64) =>
        EntityFormat.GetFromBytes(Convert.FromBase64String(entityBytesBase64));

    // Pokemon Storage entities have no owning Save File; project them against a blank save of their own context.
    private static SaveFile BlankSaveForStoredPokemon(PKM pokemon) =>
        BlankSaveFile.Get(pokemon.Context, "PKSX", LanguageID.English);

    private static List<LegalityReportLine> CreateLegalityMessages(LegalityAnalysis analysis, bool includeGeneric)
    {
        var localization = LegalityLocalizationSet.GetLocalization(LanguageID.English);
        var context = LegalityLocalizationContext.Create(analysis, localization);
        var messages = new List<LegalityReportLine>();

        foreach (var check in analysis.Results)
        {
            if (!includeGeneric && !check.IsNotGeneric())
                continue;

            var working = check;
            var message = context.Humanize(in working, false);
            if (string.IsNullOrWhiteSpace(message))
                continue;

            messages.Add(new LegalityReportLine(
                check.Judgement.ToString(),
                check.Identifier.ToString(),
                message,
                check.Valid ? null : LegalityFixId(check.Identifier)));
        }

        AddMoveLegalityMessages(messages, analysis.Info.Moves, in context, "CurrentMove", "Move", "move-set");
        AddMoveLegalityMessages(
            messages,
            analysis.Info.Relearn,
            in context,
            "RelearnMove",
            "Relearn move",
            "relearn-moves");

        return messages;
    }

    private static void AddMoveLegalityMessages(
        List<LegalityReportLine> messages,
        ReadOnlySpan<MoveResult> results,
        in LegalityLocalizationContext context,
        string identifier,
        string label,
        string fixId)
    {
        for (var index = 0; index < results.Length; index++)
        {
            var result = results[index];
            if (result.Valid)
                continue;

            messages.Add(new LegalityReportLine(
                result.Judgement.ToString(),
                identifier,
                $"{label} {index + 1}: {result.Summary(in context)}",
                fixId));
        }
    }

    private static string? LegalityFixId(CheckIdentifier identifier) => identifier switch
    {
        CheckIdentifier.CurrentMove => "move-set",
        CheckIdentifier.RelearnMove => "relearn-moves",
        CheckIdentifier.Ball => "ball",
        CheckIdentifier.Ribbon or CheckIdentifier.RibbonMark => "ribbons",
        _ => null,
    };

    private static int ClampActiveBox(int box, SaveFile save)
    {
        if (save.BoxCount <= 0)
            return 0;

        return Math.Clamp(box, 0, save.BoxCount - 1);
    }

    private enum SlotZone
    {
        Party,
        Box,
    }

    private readonly record struct SlotRef(SlotZone Zone, int Box, int Slot)
    {
        public StorageSlotType StorageSlotType => Zone == SlotZone.Party ? StorageSlotType.Party : StorageSlotType.Box;

        public static SlotRefResult From(SaveFile save, SaveSlotRef? value)
        {
            if (value is null)
                return SlotRefResult.Fail("invalid-slot", "Destination Slot is required.");

            return value.Zone switch
            {
                "party" => FromParty(save, value.Slot),
                "box" => FromBox(save, value.Box, value.Slot),
                _ => SlotRefResult.Fail("invalid-slot", "Slot zone must be party or box."),
            };
        }

        private static SlotRefResult FromParty(SaveFile save, int slot)
        {
            if (!save.HasParty || slot < 0 || slot > save.PartyCount || slot >= 6)
                return SlotRefResult.Fail("invalid-slot", "Party Slot is outside the save's party range.");

            return SlotRefResult.Success(new SlotRef(SlotZone.Party, 0, slot));
        }

        private static SlotRefResult FromBox(SaveFile save, int? box, int slot)
        {
            if (box is null || box < 0 || box >= save.BoxCount || slot < 0 || slot >= save.BoxSlotCount)
                return SlotRefResult.Fail("invalid-slot", "Box Slot is outside the save's box range.");

            return SlotRefResult.Success(new SlotRef(SlotZone.Box, box.Value, slot));
        }

        public PKM Get(SaveFile save) =>
            Zone == SlotZone.Party ? PartyPokemonOrBlank(save) : save.GetBoxSlotAtIndex(Box, Slot);

        public void Set(SaveFile save, PKM pokemon)
        {
            if (Zone == SlotZone.Party)
                save.SetPartySlotAtIndex(pokemon, Slot, EntityImportSettings.None);
            else
                save.SetBoxSlotAtIndex(pokemon, Box, Slot, EntityImportSettings.None);
        }

        public void Clear(SaveFile save)
        {
            if (Zone == SlotZone.Party)
                save.DeletePartySlot(Slot);
            else
                save.SetBoxSlotAtIndex(save.BlankPKM, Box, Slot, EntityImportSettings.None);
        }

        private PKM PartyPokemonOrBlank(SaveFile save) =>
            Slot < save.PartyCount ? save.GetPartySlotAtIndex(Slot) : save.BlankPKM;
    }

    private readonly record struct SlotRefResult(bool Ok, SlotRef Value, string Code, string Message)
    {
        public static SlotRefResult Success(SlotRef value) => new(true, value, "", "");

        public static SlotRefResult Fail(string code, string message) => new(false, default, code, message);
    }

    private readonly record struct SlotMutationResult(bool Ok, bool Mutated, string Code, string Message)
    {
        public static SlotMutationResult Success(bool mutated) => new(true, mutated, "", "");

        public static SlotMutationResult Fail(string code, string message) => new(false, false, code, message);
    }

    private readonly record struct PokemonActionMutation(
        bool Ok,
        PKM Pokemon,
        List<PokemonActionChange> Changes,
        string Code,
        string Message)
    {
        public static PokemonActionMutation Success(PKM pokemon, List<PokemonActionChange> changes) =>
            new(true, pokemon, changes, "", "");

        public static PokemonActionMutation Fail(string code, string message) =>
            new(false, null!, [], code, message);
    }

    private sealed record LegalityFixPreview(
        byte[] SourceBytes,
        Type PokemonType,
        StorageSlotType StorageSlotType,
        string FixId,
        PKM Pokemon,
        List<PokemonActionChange> Changes);

    private readonly record struct SpeciesFormProjectionResult(
        bool Ok,
        PokemonSpeciesFormEditProjection Value,
        string Code,
        string Message)
    {
        public static SpeciesFormProjectionResult Success(PokemonSpeciesFormEditProjection value) =>
            new(true, value, "", "");

        public static SpeciesFormProjectionResult Fail(string code, string message) =>
            new(false, default!, code, message);
    }
}
