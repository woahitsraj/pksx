using PKHeX.Core;
using System.Text.Json.Serialization;

namespace Pksx.Pkhex.Engine;

public sealed record EngineResult<T>(bool Ok, T? Value, EngineError? Error)
{
    public static EngineResult<T> Success(T value) => new(true, value, null);

    public static EngineResult<T> Failure(string code, string message) =>
        new(false, default, new EngineError(code, message));
}

public static class EngineResult
{
    public static EngineResult<T> Ok<T>(T value) => EngineResult<T>.Success(value);

    public static EngineResult<object> Fail(string code, string message) =>
        EngineResult<object>.Failure(code, message);
}

public sealed record EngineError(string Code, string Message);

public sealed record EngineVersion(string PkhexCoreVersion, string FacadeVersion);

public sealed record SaveSummary(
    string? FileName,
    string SaveType,
    string GameVersion,
    int GameVersionId,
    int Generation,
    string? TrainerName,
    uint TrainerId,
    string PlayTime,
    int PlayedHours,
    int PlayedMinutes,
    int PartyCount,
    int BoxCount,
    int BoxSlotCount)
{
    public static SaveSummary From(SaveFile save, string? fileName) =>
        new(
            fileName,
            save.GetType().Name,
            save.Version.ToString(),
            (int)save.Version,
            save.Generation,
            save.OT,
            save.DisplayTID,
            save.PlayTimeString,
            save.PlayedHours,
            save.PlayedMinutes,
            save.PartyCount,
            save.BoxCount,
            save.BoxSlotCount);
}

public sealed record PartySlotSummary(
    int Slot,
    ushort SpeciesId,
    byte Form,
    byte Format,
    int Level,
    uint Experience,
    PokemonExperienceProjection? ExperienceProjection,
    string Nickname,
    bool IsEgg,
    bool IsEmpty,
    string? Gender,
    string? Nature,
    string? Ability,
    string? HeldItem,
    List<SlotTypeSummary> Types,
    List<SlotStatSummary> Stats,
    List<SlotMoveSummary> Moves,
    PokemonNatureEditConstraints NatureEditConstraints,
    PokemonHeldItemEditConstraints HeldItemEditConstraints,
    PokemonAbilityEditConstraints AbilityEditConstraints,
    PokemonMetDataEditConstraints MetDataEditConstraints,
    PokemonOriginalTrainerEditConstraints OriginalTrainerEditConstraints,
    PokemonStatEditConstraints StatEditConstraints,
    PokemonMoveSetEditConstraints MoveSetEditConstraints,
    PokemonFriendshipEditConstraints FriendshipEditConstraints,
    List<PokemonBattleFieldProjection> BattleFields,
    string? OriginalTrainer,
    string? MetLabel,
    SpriteIdentity SpriteIdentity,
    string? EntityBytesBase64)
{
    public static PartySlotSummary From(PKM pokemon, SaveFile save, int slot) =>
        new(
            slot,
            pokemon.Species,
            pokemon.Form,
            pokemon.Format,
            pokemon.Species == 0 ? 0 : pokemon.CurrentLevel,
            pokemon.EXP,
            PokemonExperienceProjection.From(pokemon),
            pokemon.Nickname,
            pokemon.IsEgg,
            pokemon.Species == 0,
            SlotDetailProjection.Gender(pokemon),
            SlotDetailProjection.Nature(pokemon),
            SlotDetailProjection.Ability(pokemon),
            SlotDetailProjection.HeldItem(pokemon),
            SlotDetailProjection.Types(pokemon),
            SlotDetailProjection.Stats(pokemon),
            SlotDetailProjection.Moves(pokemon),
            SlotDetailProjection.NatureEditConstraints(pokemon),
            SlotDetailProjection.HeldItemEditConstraints(pokemon, save),
            SlotDetailProjection.AbilityEditConstraints(pokemon),
            SlotDetailProjection.MetDataEditConstraints(pokemon),
            SlotDetailProjection.OriginalTrainerEditConstraints(pokemon),
            SlotDetailProjection.StatEditConstraints(pokemon),
            SlotDetailProjection.MoveSetEditConstraints(pokemon, StorageSlotType.Party),
            SlotDetailProjection.FriendshipEditConstraints(pokemon),
            SlotDetailProjection.BattleFields(pokemon),
            SlotDetailProjection.OriginalTrainer(pokemon),
            SlotDetailProjection.MetLabel(pokemon),
            SpriteIdentity.From(pokemon),
            SlotDetailProjection.EntityBytesBase64(pokemon));
}

public sealed record BoxSlotSummary(
    int Box,
    int Slot,
    ushort SpeciesId,
    byte Form,
    byte Format,
    int Level,
    uint Experience,
    PokemonExperienceProjection? ExperienceProjection,
    string Nickname,
    bool IsEgg,
    bool IsEmpty,
    string? Gender,
    string? Nature,
    string? Ability,
    string? HeldItem,
    List<SlotTypeSummary> Types,
    List<SlotStatSummary> Stats,
    List<SlotMoveSummary> Moves,
    PokemonNatureEditConstraints NatureEditConstraints,
    PokemonHeldItemEditConstraints HeldItemEditConstraints,
    PokemonAbilityEditConstraints AbilityEditConstraints,
    PokemonMetDataEditConstraints MetDataEditConstraints,
    PokemonOriginalTrainerEditConstraints OriginalTrainerEditConstraints,
    PokemonStatEditConstraints StatEditConstraints,
    PokemonMoveSetEditConstraints MoveSetEditConstraints,
    PokemonFriendshipEditConstraints FriendshipEditConstraints,
    List<PokemonBattleFieldProjection> BattleFields,
    string? OriginalTrainer,
    string? MetLabel,
    SpriteIdentity SpriteIdentity,
    string? EntityBytesBase64)
{
    public static BoxSlotSummary From(PKM pokemon, SaveFile save, int box, int slot) =>
        new(
            box,
            slot,
            pokemon.Species,
            pokemon.Form,
            pokemon.Format,
            pokemon.Species == 0 ? 0 : pokemon.CurrentLevel,
            pokemon.EXP,
            PokemonExperienceProjection.From(pokemon),
            pokemon.Nickname,
            pokemon.IsEgg,
            pokemon.Species == 0,
            SlotDetailProjection.Gender(pokemon),
            SlotDetailProjection.Nature(pokemon),
            SlotDetailProjection.Ability(pokemon),
            SlotDetailProjection.HeldItem(pokemon),
            SlotDetailProjection.Types(pokemon),
            SlotDetailProjection.Stats(pokemon),
            SlotDetailProjection.Moves(pokemon),
            SlotDetailProjection.NatureEditConstraints(pokemon),
            SlotDetailProjection.HeldItemEditConstraints(pokemon, save),
            SlotDetailProjection.AbilityEditConstraints(pokemon),
            SlotDetailProjection.MetDataEditConstraints(pokemon),
            SlotDetailProjection.OriginalTrainerEditConstraints(pokemon),
            SlotDetailProjection.StatEditConstraints(pokemon),
            SlotDetailProjection.MoveSetEditConstraints(pokemon, StorageSlotType.Box),
            SlotDetailProjection.FriendshipEditConstraints(pokemon),
            SlotDetailProjection.BattleFields(pokemon),
            SlotDetailProjection.OriginalTrainer(pokemon),
            SlotDetailProjection.MetLabel(pokemon),
            SpriteIdentity.From(pokemon),
            SlotDetailProjection.EntityBytesBase64(pokemon));
}

public sealed record SpriteIdentity(
    ushort SpeciesId,
    byte Form,
    bool IsEgg,
    bool IsShiny,
    string DisplaySex)
{
    private static readonly HashSet<ushort> SpeciesWithSexDifference =
    [
        3, 12, 19, 20, 25, 26, 41, 42, 44, 45, 64, 65, 84, 85, 97, 111, 112, 118, 119, 123,
        129, 130, 154, 165, 166, 178, 185, 186, 190, 194, 195, 198, 202, 203, 207, 208, 212,
        214, 215, 217, 221, 224, 229, 232, 255, 256, 257, 267, 269, 272, 274, 275, 307, 308,
        315, 316, 317, 322, 323, 332, 350, 369, 396, 397, 398, 399, 400, 401, 402, 403, 404,
        405, 407, 415, 417, 418, 419, 424, 443, 444, 445, 449, 450, 453, 454, 456, 457, 459,
        460, 461, 464, 465, 473, 521, 592, 593, 668, 678, 876, 902, 916
    ];

    public static SpriteIdentity From(PKM pokemon) =>
        new(
            pokemon.Species,
            pokemon.Form,
            pokemon.IsEgg,
            pokemon.IsShiny,
            DisplaySexFor(pokemon));

    private static string DisplaySexFor(PKM pokemon)
    {
        if (pokemon.Species == 0 || !SpeciesWithSexDifference.Contains(pokemon.Species))
            return "default";

        return pokemon.Gender switch
        {
            0 => "male",
            1 => "female",
            _ => "default",
        };
    }
}

public sealed record PokemonExperienceProjection(
    int MinLevel,
    int MaxLevel,
    uint MinExperience,
    uint MaxExperience,
    uint CurrentLevelMinExperience,
    uint NextLevelMinExperience,
    double CurrentLevelProgress)
{
    public static PokemonExperienceProjection? From(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return null;

        var growth = pokemon.PersonalInfo.EXPGrowth;
        var currentLevel = Experience.ClampLevel(pokemon.CurrentLevel);
        var currentLevelMinExperience = Experience.GetEXP(currentLevel, growth);
        var nextLevelMinExperience = currentLevel >= Experience.MaxLevel
            ? Experience.GetEXP((byte)Experience.MaxLevel, growth)
            : Experience.GetEXP((byte)(currentLevel + 1), growth);

        return new PokemonExperienceProjection(
            Experience.MinLevel,
            Experience.MaxLevel,
            Experience.GetEXP((byte)Experience.MinLevel, growth),
            Experience.GetEXP((byte)Experience.MaxLevel, growth),
            currentLevelMinExperience,
            nextLevelMinExperience,
            Experience.GetEXPToLevelUpPercentage(currentLevel, pokemon.EXP, growth));
    }
}

public sealed record SlotTypeSummary(string Name, int Hue, double Chroma);

public sealed record SlotStatSummary(string Key, string Label, int Value, int? Ev, int? Iv, int Max);

public sealed record SlotMoveSummary(int Slot, ushort Id, string Name, string Type, int Hue, double Chroma, int? Pp, int? MaxPp, int? PpUps);

public sealed record PokemonOriginalTrainerOption(int Id, string Name);

public sealed record PokemonOriginalTrainerEditConstraints(
    bool Supported,
    string CurrentName,
    int CurrentTrainerId,
    int CurrentSecretId,
    int CurrentGenderId,
    int CurrentLanguageId,
    int MaxNameLength,
    int MinTrainerId,
    int MaxTrainerId,
    bool SupportsSecretId,
    bool SupportsGender,
    bool SupportsLanguage,
    List<PokemonOriginalTrainerOption> Genders,
    List<PokemonOriginalTrainerOption> Languages,
    string? UnsupportedReason);

public sealed record PokemonNatureOption(int Id, string Name, string Effect);

public sealed record PokemonNatureEditConstraints(
    bool Supported,
    int CurrentNatureId,
    int OriginalNatureId,
    int StatNatureId,
    bool UsesStatNature,
    List<PokemonNatureOption> Options,
    string? UnsupportedReason);

public sealed record PokemonHeldItemOption(int Id, string Name, bool Available, string? UnavailableReason);

public sealed record PokemonHeldItemEditConstraints(
    bool Supported,
    int CurrentItemId,
    List<PokemonHeldItemOption> Options,
    string? UnsupportedReason);

public sealed record PokemonAbilityOption(
    int Index,
    int Id,
    string Name,
    bool Hidden,
    bool Available,
    string? UnavailableReason);

public sealed record PokemonAbilityEditConstraints(
    bool Supported,
    int CurrentAbilityIndex,
    List<PokemonAbilityOption> Options,
    string? UnsupportedReason);

public sealed record PokemonStatEditConstraints(
    bool Supported,
    int MinIv,
    int MaxIv,
    int MinEv,
    int MaxEv,
    int MaxTotalEv,
    string? UnsupportedReason);

public sealed record PokemonMoveOption(ushort Id, string Name, string Type, int Hue, double Chroma, int MaxPp);

public sealed record PokemonMoveSetEditConstraints(
    bool Supported,
    int MaxMoveSlots,
    List<PokemonMoveOption> AvailableMoves,
    string? UnsupportedReason);

public sealed record PokemonSpeciesOption(ushort Id, string Name);

public sealed record PokemonCreationCatalogue(
    PokemonSpeciesOption? DefaultSpecies,
    List<PokemonSpeciesOption> AvailableSpecies);

public sealed record PokemonFormOption(byte Id, string Name);

public sealed record PokemonSpeciesFormPreviewRequest(
    SaveSlotRef Source,
    ushort SpeciesId,
    byte Form);

public sealed record PokemonSpeciesFormPreview(
    ushort SpeciesId,
    string SpeciesName,
    byte Form,
    string FormName,
    string? Ability,
    string? Gender,
    List<string> Types,
    List<string> Moves,
    SpriteIdentity SpriteIdentity,
    bool Legal,
    string LegalitySummary,
    List<string> Consequences);

public sealed record PokemonSpeciesFormEditProjection(
    List<PokemonSpeciesOption> AvailableSpecies,
    List<PokemonFormOption> AvailableForms,
    PokemonSpeciesFormPreview Preview);

public sealed record PokemonMetDataOption(int Id, string Name);

public sealed record PokemonMetLocationGroup(int OriginGameId, List<PokemonMetDataOption> Options);

public sealed record PokemonMetDataEditConstraints(
    bool Supported,
    int CurrentLocationId,
    int CurrentMetLevel,
    string? CurrentMetDate,
    int CurrentOriginGameId,
    int CurrentBallId,
    int MinMetLevel,
    int MaxMetLevel,
    bool SupportsMetDate,
    bool SupportsOriginGame,
    bool SupportsBall,
    List<PokemonMetLocationGroup> LocationGroups,
    List<PokemonMetDataOption> OriginGames,
    List<PokemonMetDataOption> Balls,
    string? UnsupportedReason);

public sealed record PokemonFriendshipField(string Key, string Label, int Value, int Min, int Max);

public sealed record PokemonFriendshipEditConstraints(
    bool Supported,
    List<PokemonFriendshipField> Fields,
    string? UnsupportedReason);

public sealed record PokemonBattleFieldOption(int Value, string Label);

public sealed record PokemonBattleFieldProjection(
    string Key,
    string Label,
    int Value,
    string ValueLabel,
    bool Supported,
    List<PokemonBattleFieldOption> Options,
    string? UnsupportedReason);

public sealed record SaveWorkspace(
    SaveSummary Summary,
    List<PartySlotSummary> PartySlots,
    List<BoxSlotSummary> BoxSlots,
    SaveFileEditableProjection SaveFile);

public sealed record SaveFileEditableProjection(
    TrainerProfileProjection TrainerProfile,
    MoneyProjection Money,
    InventoryProjection Inventory)
{
    public static SaveFileEditableProjection From(SaveFile save)
    {
        var nameSupported = SaveFileFieldSupport.IsOverridden(save, nameof(SaveFile.OT));
        var genderSupported = SaveFileFieldSupport.IsOverridden(save, nameof(SaveFile.Gender));
        var moneySupported = SaveFileFieldSupport.IsOverridden(save, nameof(SaveFile.Money));
        var bag = save.Inventory;
        var inventorySupported = bag.Pouches.Count > 0;

        return new SaveFileEditableProjection(
            new TrainerProfileProjection(
                save.OT,
                nameSupported,
                nameSupported ? save.MaxStringLengthTrainer : 0,
                nameSupported ? null : "Trainer name editing is not supported for this Save File format.",
                genderSupported ? save.Gender switch { 0 => "male", 1 => "female", _ => null } : null,
                genderSupported,
                genderSupported ? null : "Trainer gender editing is not supported for this Save File format.",
                save.DisplayTID,
                save.Version.ToString(),
                save.Generation),
            new MoneyProjection(
                moneySupported ? save.Money : null,
                0,
                moneySupported ? save.MaxMoney : 0,
                moneySupported,
                moneySupported ? null : "Money editing is not supported for this Save File format."),
            new InventoryProjection(
                inventorySupported,
                inventorySupported ? null : "Inventory editing is not supported for this Save File format.",
                inventorySupported ? bag.Pouches.Select(pouch => InventoryPocketProjection.From(save, bag, pouch)).ToList() : []));
    }
}

/// Available-item catalogue, fetched on demand because it is far too large to embed in every workspace.
public sealed record SaveFileInventoryCatalogue(
    bool Supported,
    string? UnsupportedReason,
    List<InventoryPocketCatalogue> Pockets)
{
    public static SaveFileInventoryCatalogue From(SaveFile save)
    {
        var bag = save.Inventory;
        if (bag.Pouches.Count == 0)
            return new SaveFileInventoryCatalogue(false, "Inventory editing is not supported for this Save File format.", []);

        return new SaveFileInventoryCatalogue(
            true,
            null,
            bag.Pouches
                .Select(pouch => new InventoryPocketCatalogue(
                    pouch.Type.ToString(),
                    InventoryPocketProjection.AvailableItemsFor(save, bag, pouch)))
                .ToList());
    }
}

public sealed record InventoryPocketCatalogue(string Key, List<InventoryItemOption> AvailableItems);

public sealed record TrainerProfileProjection(
    string? TrainerName,
    bool TrainerNameSupported,
    int TrainerNameMaxLength,
    string? TrainerNameUnsupportedReason,
    string? Gender,
    bool GenderSupported,
    string? GenderUnsupportedReason,
    uint TrainerId,
    string GameVersion,
    int Generation);

public sealed record MoneyProjection(
    uint? Value,
    int Min,
    int Max,
    bool Supported,
    string? UnsupportedReason);

public sealed record InventoryProjection(
    bool Supported,
    string? UnsupportedReason,
    List<InventoryPocketProjection> Pockets);

public sealed record InventoryPocketProjection(
    string Key,
    string Label,
    int Capacity,
    bool Full,
    string? UnsupportedReason,
    List<InventoryItemProjection> Items)
{
    public static InventoryPocketProjection From(SaveFile save, PlayerBag bag, InventoryPouch pouch)
    {
        var items = pouch.Items
            .Where(item => item.Index > 0 && item.Count > 0)
            .Select(item => new InventoryItemProjection(
                item.Index,
                ItemName(item.Index),
                item.Count,
                bag.GetMaxCount(pouch.Type, item.Index)))
            .OrderBy(item => item.Name, StringComparer.Ordinal)
            .ToList();

        return new InventoryPocketProjection(
            pouch.Type.ToString(),
            InventoryLabel(pouch.Type),
            pouch.Items.Length,
            pouch.FindIndexFirstEmptySlot() < 0,
            null,
            items);
    }

    public static List<InventoryItemOption> AvailableItemsFor(SaveFile save, PlayerBag bag, InventoryPouch pouch)
    {
        var available = new List<InventoryItemOption>();

        foreach (var itemId in pouch.GetAllItems())
        {
            var max = bag.GetMaxCount(pouch.Type, itemId);
            if (itemId == 0 || itemId > save.MaxItemID || max <= 0 || !bag.IsLegal(pouch.Type, itemId, Math.Min(1, max)))
                continue;

            var name = ItemName(itemId);
            if (name.StartsWith("Item ", StringComparison.Ordinal) || name.Contains("???", StringComparison.Ordinal))
                continue;
            available.Add(new InventoryItemOption(itemId, name, max));
        }

        available.Sort((left, right) => StringComparer.Ordinal.Compare(left.Name, right.Name));
        return available;
    }

    private static string ItemName(int itemId) =>
        itemId < GameInfo.Strings.Item.Count && !string.IsNullOrWhiteSpace(GameInfo.Strings.Item[itemId])
            ? GameInfo.Strings.Item[itemId]
            : $"Item {itemId}";

    private static string InventoryLabel(InventoryType type) => type switch
    {
        InventoryType.KeyItems => "Key Items",
        InventoryType.TMHMs => "TMs & HMs",
        InventoryType.BattleItems => "Battle Items",
        InventoryType.MailItems => "Mail",
        InventoryType.PCItems => "PC Items",
        InventoryType.FreeSpace => "Free Space",
        InventoryType.ZCrystals => "Z-Crystals",
        InventoryType.MegaStones => "Mega Stones",
        _ => type.ToString(),
    };
}

public sealed record InventoryItemProjection(int Id, string Name, int Quantity, int MaxQuantity);

public sealed record InventoryItemOption(int Id, string Name, int MaxQuantity);

internal static class SaveFileFieldSupport
{
    public static bool IsOverridden(SaveFile save, string propertyName) => propertyName switch
    {
        nameof(SaveFile.OT) => save is SAV1 or SAV2 or SAV3 or SAV3Colosseum or SAV3XD or SAV4 or SAV5 or SAV6 or SAV7 or SAV7b or SAV8SWSH or SAV8LA or SAV8BS or SAV9SV or SAV9ZA,
        nameof(SaveFile.Gender) => save is SAV2 { Version: GameVersion.C } or SAV3 or SAV3Colosseum or SAV3XD or SAV4 or SAV5 or SAV6 or SAV7 or SAV7b or SAV8SWSH or SAV8LA or SAV8BS or SAV9SV or SAV9ZA,
        nameof(SaveFile.Money) => save is SAV1 or SAV2 or SAV3 or SAV3Colosseum or SAV3XD or SAV4 or SAV4BR or SAV5 or SAV6 or SAV7 or SAV7b or SAV8SWSH or SAV8LA or SAV8BS or SAV9SV or SAV9ZA,
        _ => false,
    };
}

public sealed record SerializedSave(string BytesBase64, int ByteLength);

public sealed record SaveSlotRef(string Zone, int? Box, int Slot);

public sealed record SlotOperationRequest(
    string Kind,
    SaveSlotRef Source,
    SaveSlotRef? Destination,
    int ActiveBox);

public sealed record SlotOperationResult(
    string BytesBase64,
    int ByteLength,
    bool Mutated,
    SaveWorkspace Workspace);

public sealed record PokemonEditOperationRequest(
    SaveSlotRef Source,
    int ActiveBox,
    ushort? SpeciesId,
    byte? Form,
    string? Nickname,
    int? Level,
    uint? Experience,
    int? NatureId,
    int? HeldItemId,
    int? AbilityIndex,
    PokemonMetDataEdit? MetData,
    PokemonOriginalTrainerEdit? OriginalTrainer,
    PokemonStatEditSet? Ivs,
    PokemonStatEditSet? Evs,
    List<PokemonMoveSlotEdit>? Moves,
    List<PokemonFriendshipFieldEdit>? FriendshipEdits,
    int? TeraType);

public sealed record PokemonStatEditSet(
    [property: JsonPropertyName("HP")] int HP,
    [property: JsonPropertyName("ATK")] int ATK,
    [property: JsonPropertyName("DEF")] int DEF,
    [property: JsonPropertyName("SPA")] int SPA,
    [property: JsonPropertyName("SPD")] int SPD,
    [property: JsonPropertyName("SPE")] int SPE);

public sealed record PokemonMoveSlotEdit(int Slot, ushort Move, int? Pp, int? PpUps);

public sealed record PokemonMetDataEdit(
    int LocationId,
    int MetLevel,
    string? MetDate,
    int? OriginGameId,
    int? BallId);

public sealed record PokemonOriginalTrainerEdit(
    string Name,
    int TrainerId,
    int? SecretId,
    int? GenderId,
    int? LanguageId);

public sealed record PokemonFriendshipFieldEdit(string Key, int Value);

public sealed record PokemonEditOperationResult(
    string BytesBase64,
    int ByteLength,
    bool Mutated,
    SaveWorkspace Workspace);

public sealed record SaveFileEditOperationRequest(
    TrainerProfileEdit? TrainerProfile,
    long? Money,
    List<InventoryEditOperation>? Inventory,
    int ActiveBox);

public sealed record TrainerProfileEdit(string? TrainerName, string? Gender);

public sealed record InventoryEditOperation(string Kind, string Pocket, int ItemId, int? Quantity);

public sealed record SaveFileEditOperationResult(
    string BytesBase64,
    int ByteLength,
    bool Mutated,
    SaveWorkspace Workspace);

public sealed record PokemonCreationRequest(
    SaveSlotRef Destination,
    ushort? SpeciesId,
    int Level,
    int ActiveBox);

public sealed record PokemonCreationResult(
    string BytesBase64,
    int ByteLength,
    bool Mutated,
    SaveWorkspace Workspace);

public sealed record StoredPokemonImportRequest(
    string EntityBytesBase64,
    SaveSlotRef Destination,
    int ActiveBox);

public sealed record StoredPokemonImportResult(
    string BytesBase64,
    int ByteLength,
    bool Mutated,
    SaveWorkspace Workspace);

public sealed record LegalityReportLine(
    string Severity,
    string Identifier,
    string Message,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? FixId = null);

public sealed record LegalityReport(
    bool Legal,
    string Judgement,
    string Summary,
    List<string> FixableProblems,
    List<LegalityReportLine> Warnings,
    List<LegalityReportLine> Messages);

public sealed record PokemonActionChange(string Field, string Before, string After);

public sealed record PokemonEvolutionChoice(
    string Id,
    ushort SpeciesId,
    byte Form,
    string SpeciesName,
    string Method,
    string Requirement,
    List<PokemonActionChange> Changes);

public sealed record PokemonLegalityFixChoice(
    string Id,
    string Token,
    string Label,
    List<PokemonActionChange> Changes);

public sealed record PokemonActionAvailability(
    string Kind,
    bool Available,
    string? UnavailableReason,
    List<PokemonActionChange> Changes,
    List<PokemonEvolutionChoice> Choices,
    List<PokemonLegalityFixChoice> Fixes);

public sealed record PokemonActionPreview(
    LegalityReport LegalityReport,
    List<PokemonActionAvailability> Actions);

public sealed record PokemonActionRequest(
    string Kind,
    SaveSlotRef? Source,
    string? ChoiceId,
    int ActiveBox);

public sealed record PokemonActionResult(
    string BytesBase64,
    int ByteLength,
    bool Mutated,
    SaveWorkspace Workspace,
    List<PokemonActionChange> Changes);

public sealed record StoredPokemonActionRequest(
    string Kind,
    string? ChoiceId);

public sealed record StoredPokemonActionResult(
    string EntityBytesBase64,
    bool Mutated,
    BoxSlotSummary Projection,
    List<PokemonActionChange> Changes);

internal static class SlotDetailProjection
{
    private static readonly string[] NatureStats = ["Attack", "Defense", "Speed", "Sp. Atk", "Sp. Def"];

    private static readonly string[] StatKeys = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"];

    private static readonly string[] StatLabels = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"];

    private static readonly int[] StatValueIndexes = [0, 1, 2, 4, 5, 3];

    private static readonly int[] TypeHues =
    [
        107, 28, 294, 328, 88, 98, 117, 303, 286,
        53, 264, 136, 94, 6, 192, 287, 56, 349
    ];

    private static readonly double[] TypeChromas =
    [
        0.06, 0.18, 0.14, 0.17, 0.11, 0.12, 0.16, 0.10, 0.04,
        0.16, 0.15, 0.17, 0.16, 0.20, 0.07, 0.21, 0.05, 0.11
    ];

    public static string? Gender(PKM pokemon) =>
        pokemon.Species == 0 ? null : pokemon.Gender switch
        {
            0 => "♂",
            1 => "♀",
            _ => null,
        };

    public static string? Nature(PKM pokemon) =>
        pokemon.Species == 0 ? null : NameAt(GameInfo.Strings.Natures, (int)pokemon.Nature);

    public static string? Ability(PKM pokemon) =>
        pokemon.Species == 0 ? null : NameAt(GameInfo.Strings.Ability, pokemon.Ability);

    public static string? HeldItem(PKM pokemon) =>
        pokemon.Species == 0 || pokemon.HeldItem <= 0
            ? null
            : NameAt(GameInfo.Strings.GetItemStrings(pokemon.Context, pokemon.Version), pokemon.HeldItem);

    public static PokemonFriendshipEditConstraints FriendshipEditConstraints(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return new(false, [], "Friendship Editing needs an occupied Slot.");
        if (pokemon.Format < 2)
            return new(false, [], "Friendship Editing is not supported for Generation 1 Pokemon.");

        var fields = new List<PokemonFriendshipField>
        {
            new(
                pokemon.IsEgg ? "hatch-counter" : "friendship",
                pokemon.IsEgg ? "Hatch Counter" : "Friendship",
                pokemon.CurrentFriendship,
                byte.MinValue,
                byte.MaxValue)
        };

        if (!pokemon.IsEgg && pokemon is IAffection affection)
        {
            var value = pokemon.CurrentHandler == 0
                ? affection.OriginalTrainerAffection
                : affection.HandlingTrainerAffection;
            fields.Add(new("affection", "Affection", value, byte.MinValue, byte.MaxValue));
        }

        return new(true, fields, null);
    }

    public static List<SlotTypeSummary> Types(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return [];

        var info = pokemon.PersonalInfo;
        var first = TypeName(info.Type1);
        var second = info.Type2 == info.Type1 ? null : TypeName(info.Type2);

        var result = new List<SlotTypeSummary>(2);
        if (first is not null)
            result.Add(new SlotTypeSummary(first, TypeHue(info.Type1), TypeChroma(info.Type1)));
        if (second is not null)
            result.Add(new SlotTypeSummary(second, TypeHue(info.Type2), TypeChroma(info.Type2)));
        return result;
    }

    public static List<SlotStatSummary> Stats(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return [];

        var values = pokemon.GetStats(pokemon.PersonalInfo);
        var evs = new[] { pokemon.EV_HP, pokemon.EV_ATK, pokemon.EV_DEF, pokemon.EV_SPA, pokemon.EV_SPD, pokemon.EV_SPE };
        var ivs = new[] { pokemon.IV_HP, pokemon.IV_ATK, pokemon.IV_DEF, pokemon.IV_SPA, pokemon.IV_SPD, pokemon.IV_SPE };
        var result = new List<SlotStatSummary>(StatKeys.Length);

        for (var index = 0; index < StatKeys.Length && index < values.Length; index++)
        {
            var valueIndex = StatValueIndexes[index];
            result.Add(new SlotStatSummary(
                StatKeys[index],
                StatLabels[index],
                valueIndex < values.Length ? values[valueIndex] : 0,
                evs[index] > 0 ? evs[index] : null,
                ivs[index],
                255));
        }

        return result;
    }

    public static List<SlotMoveSummary> Moves(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return [];

        ushort[] moves = [pokemon.Move1, pokemon.Move2, pokemon.Move3, pokemon.Move4];
        int[] pp = [pokemon.Move1_PP, pokemon.Move2_PP, pokemon.Move3_PP, pokemon.Move4_PP];
        int[] ppUps = [pokemon.Move1_PPUps, pokemon.Move2_PPUps, pokemon.Move3_PPUps, pokemon.Move4_PPUps];
        var result = new List<SlotMoveSummary>(moves.Length);

        for (var index = 0; index < moves.Length; index++)
        {
            var move = moves[index];
            if (move == 0)
                continue;

            var name = NameAt(GameInfo.Strings.Move, move);
            if (name is null)
                continue;

            var typeId = MoveInfo.GetType(move, pokemon.Context);
            var type = TypeName(typeId) ?? "Move";
            var hue = TypeHue(typeId);
            result.Add(new SlotMoveSummary(
                index,
                move,
                name,
                type,
                hue,
                TypeChroma(typeId),
                pp[index] > 0 ? pp[index] : null,
                pokemon.GetMovePP(move, ppUps[index]),
                ppUps[index]));
        }

        return result;
    }

    public static PokemonOriginalTrainerEditConstraints OriginalTrainerEditConstraints(PKM pokemon)
    {
        if (pokemon.Species == 0)
        {
            return new PokemonOriginalTrainerEditConstraints(
                false, "", 0, 0, 0, 0, 0, 0, ushort.MaxValue, false, false, false, [], [],
                "Original Trainer Data Editing needs an occupied Slot.");
        }

        var supportsExtendedFields = pokemon.Format >= 3;
        var languages = supportsExtendedFields
            ? GameInfo.LanguageDataSource(pokemon.Format, pokemon.Context)
                .Where(option => option.Value > 0)
                .GroupBy(option => option.Value)
                .Select(group => group.First())
                .Select(option => new PokemonOriginalTrainerOption(option.Value, option.Text))
                .ToList()
            : [];
        if (supportsExtendedFields && languages.All(option => option.Id != pokemon.Language))
            languages.Add(new PokemonOriginalTrainerOption(
                pokemon.Language,
                ((LanguageID)pokemon.Language).ToString()));

        return new PokemonOriginalTrainerEditConstraints(
            true,
            pokemon.OriginalTrainerName,
            pokemon.TID16,
            pokemon.SID16,
            pokemon.OriginalTrainerGender,
            pokemon.Language,
            pokemon.MaxStringLengthTrainer,
            0,
            ushort.MaxValue,
            supportsExtendedFields,
            supportsExtendedFields,
            supportsExtendedFields,
            supportsExtendedFields
                ? [new PokemonOriginalTrainerOption(0, "Male"), new PokemonOriginalTrainerOption(1, "Female")]
                : [],
            languages,
            null);
    }

    public static PokemonStatEditConstraints StatEditConstraints(PKM pokemon)
    {
        if (pokemon.Species == 0)
        {
            return new PokemonStatEditConstraints(
                false,
                0,
                0,
                0,
                0,
                0,
                "IV and EV Editing needs an occupied Slot.");
        }

        var maxTotalEv = pokemon.MaxEV > EffortValues.Max255
            ? pokemon.MaxEV * StatKeys.Length
            : EffortValues.Max510;

        return new PokemonStatEditConstraints(
            true,
            0,
            pokemon.MaxIV,
            0,
            pokemon.MaxEV,
            maxTotalEv,
            null);
    }

    public static PokemonMetDataEditConstraints MetDataEditConstraints(PKM pokemon)
    {
        var supported = pokemon.Species != 0 && pokemon.Format >= 2;
        var supportsOriginGame = supported && pokemon.Format >= 3;
        var supportsBall = supported && pokemon.Format >= 3;
        var supportsMetDate = supported && pokemon.Format >= 4;
        var originGames = supportsOriginGame
            ? GameUtil.GetVersionsWithinRange(pokemon, pokemon.Context)
                .Select(version => new PokemonMetDataOption((int)version, GameInfo.GetVersionName(version)))
                .ToList()
            : [];

        if (supportsOriginGame && originGames.All(option => option.Id != (int)pokemon.Version))
            originGames.Add(new PokemonMetDataOption((int)pokemon.Version, GameInfo.GetVersionName(pokemon.Version)));

        var locationVersions = supportsOriginGame
            ? originGames.Select(option => (GameVersion)option.Id)
            : [pokemon.Version];
        var locationGroups = locationVersions
            .Distinct()
            .Select(version => new PokemonMetLocationGroup(
                (int)version,
                GameInfo.GetLocationList(version, pokemon.Context)
                    .GroupBy(option => option.Value)
                    .Select(group => group.First())
                    .Select(option => new PokemonMetDataOption(option.Value, option.Text))
                    .ToList()))
            .ToList();

        var currentGroup = locationGroups.Find(group => group.OriginGameId == (int)pokemon.Version);
        if (supported && currentGroup is not null && currentGroup.Options.All(option => option.Id != pokemon.MetLocation))
        {
            currentGroup.Options.Add(new PokemonMetDataOption(
                pokemon.MetLocation,
                GameInfo.GetLocationName(false, pokemon.MetLocation, pokemon.Format, pokemon.Generation, pokemon.Version)));
        }

        var balls = supportsBall
            ? GameInfo.Sources.BallDataSource
                .Where(option => option.Value > 0 && option.Value <= pokemon.MaxBallID)
                .Select(option => new PokemonMetDataOption(option.Value, option.Text))
                .ToList()
            : [];
        if (supportsBall && balls.All(option => option.Id != pokemon.Ball))
            balls.Add(new PokemonMetDataOption(pokemon.Ball, ((Ball)pokemon.Ball).ToString()));

        return new PokemonMetDataEditConstraints(
            supported,
            pokemon.MetLocation,
            pokemon.MetLevel,
            pokemon.MetDate?.ToString("yyyy-MM-dd"),
            (int)pokemon.Version,
            pokemon.Ball,
            0,
            100,
            supportsMetDate,
            supportsOriginGame,
            supportsBall,
            locationGroups,
            originGames,
            balls,
            supported ? null : "Met Data Editing is not supported for this Pokemon Entity format.");
    }

    public static PokemonAbilityEditConstraints AbilityEditConstraints(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return new PokemonAbilityEditConstraints(
                false,
                -1,
                [],
                "Ability Editing needs an occupied Slot.");

        if (pokemon.Format < 3 || pokemon.PersonalInfo.AbilityCount == 0)
            return new PokemonAbilityEditConstraints(
                false,
                -1,
                [],
                "Ability Editing is not supported for this Pokemon format.");

        var options = new List<PokemonAbilityOption>(pokemon.PersonalInfo.AbilityCount);
        for (var index = 0; index < pokemon.PersonalInfo.AbilityCount; index++)
        {
            var ability = pokemon.PersonalInfo.GetAbilityAtIndex(index);
            if (ability <= 0)
                continue;

            var name = NameAt(GameInfo.Strings.Ability, ability) ?? $"Ability {ability}";
            options.Add(new PokemonAbilityOption(index, ability, name, index == 2, true, null));
        }

        return new PokemonAbilityEditConstraints(
            options.Count > 0,
            CurrentAbilityIndex(pokemon),
            options,
            options.Count > 0 ? null : "PKHeX found no Ability choices for this Pokemon.");
    }

    public static PokemonHeldItemEditConstraints HeldItemEditConstraints(PKM pokemon, SaveFile save)
    {
        if (pokemon.Species == 0)
            return new PokemonHeldItemEditConstraints(
                false,
                0,
                [],
                "Held Item Editing needs an occupied Slot.");

        if (pokemon.Format < 2 || save.HeldItems.Length == 0)
            return new PokemonHeldItemEditConstraints(
                false,
                pokemon.HeldItem,
                [],
                "Held Item Editing is not supported for this Pokemon Entity format.");

        if (pokemon.IsEgg)
            return new PokemonHeldItemEditConstraints(
                false,
                pokemon.HeldItem,
                [],
                "Egg Pokemon cannot hold items.");

        var options = new List<PokemonHeldItemOption>(save.HeldItems.Length + 1)
        {
            new(0, "No item", true, null)
        };
        var itemNames = GameInfo.Strings.GetItemStrings(pokemon.Context, pokemon.Version);

        foreach (var item in save.HeldItems)
        {
            var name = NameAt(itemNames, item) ?? $"Item {item}";
            var reason = HeldItemUnavailableReason(pokemon, item, name);
            options.Add(new PokemonHeldItemOption(item, name, reason is null, reason));
        }

        if (pokemon.HeldItem > 0 && options.All(option => option.Id != pokemon.HeldItem))
        {
            var name = NameAt(itemNames, pokemon.HeldItem) ?? $"Item {pokemon.HeldItem}";
            options.Add(new PokemonHeldItemOption(
                pokemon.HeldItem,
                name,
                false,
                $"{name} is not available in the active Save File."));
        }

        return new PokemonHeldItemEditConstraints(true, pokemon.HeldItem, options, null);
    }

    public static PokemonNatureEditConstraints NatureEditConstraints(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return new PokemonNatureEditConstraints(
                false,
                -1,
                -1,
                -1,
                false,
                [],
                "Nature Editing needs an occupied Slot.");

        if (pokemon.Format < 3)
            return new PokemonNatureEditConstraints(
                false,
                -1,
                (int)pokemon.Nature,
                (int)pokemon.StatNature,
                false,
                [],
                "Nature Editing is not supported for this Pokemon format.");

        var options = new List<PokemonNatureOption>(25);
        for (var id = 0; id < 25; id++)
        {
            var name = NameAt(GameInfo.Strings.Natures, id);
            if (name is not null)
                options.Add(new PokemonNatureOption(id, name, NatureEffect(id)));
        }

        var usesStatNature = pokemon.Format >= 8;
        return new PokemonNatureEditConstraints(
            options.Count == 25,
            usesStatNature ? (int)pokemon.StatNature : (int)pokemon.Nature,
            (int)pokemon.Nature,
            (int)pokemon.StatNature,
            usesStatNature,
            options,
            options.Count == 25 ? null : "PKHeX did not provide every Nature choice.");
    }

    public static PokemonMoveSetEditConstraints MoveSetEditConstraints(PKM pokemon, StorageSlotType storageSlotType)
    {
        if (pokemon.Species == 0)
        {
            return new PokemonMoveSetEditConstraints(
                false,
                0,
                [],
                "Move Set Editing needs an occupied Slot.");
        }

        var options = new List<PokemonMoveOption> { MoveOption(pokemon, 0) };

        try
        {
            var analysis = new LegalityAnalysis(pokemon, storageSlotType);
            var legalMoves = new LegalMoveInfo();
            legalMoves.ReloadMoves(analysis);

            for (ushort move = 1; move <= pokemon.MaxMoveID; move++)
            {
                if (MoveInfo.IsDummiedMove(pokemon, move) || !legalMoves.CanLearn(move))
                    continue;

                options.Add(MoveOption(pokemon, move));
            }
        }
        catch
        {
            for (ushort move = 1; move <= pokemon.MaxMoveID; move++)
            {
                if (MoveInfo.IsDummiedMove(pokemon, move) || !MoveInfo.IsMoveKnowable(move))
                    continue;

                options.Add(MoveOption(pokemon, move));
            }
        }

        return new PokemonMoveSetEditConstraints(true, 4, options, null);
    }

    public static List<PokemonBattleFieldProjection> BattleFields(PKM pokemon)
    {
        if (pokemon is not ITeraType teraType)
            return [];

        var value = (byte)teraType.TeraType;
        var supported = TeraTypeUtil.CanChangeTeraType(pokemon.Species);
        var options = Enumerable.Range(0, TeraTypeUtil.MaxType + 1)
            .Select(type => new PokemonBattleFieldOption(type, TeraTypeName((byte)type)))
            .Append(new PokemonBattleFieldOption(TeraTypeUtil.Stellar, TeraTypeName(TeraTypeUtil.Stellar)))
            .ToList();

        return
        [
            new PokemonBattleFieldProjection(
                "tera-type",
                "Tera Type",
                value,
                TeraTypeName(value),
                supported,
                options,
                supported ? null : "Tera Type Editing is not supported for this Pokemon species.")
        ];
    }

    public static string? OriginalTrainer(PKM pokemon) =>
        pokemon.Species == 0 || string.IsNullOrWhiteSpace(pokemon.OriginalTrainerName) ? null : pokemon.OriginalTrainerName;

    public static string? MetLabel(PKM pokemon)
    {
        if (pokemon.Species == 0 || pokemon.Format < 2)
            return null;

        var location = GameInfo.GetLocationName(
            false,
            pokemon.MetLocation,
            pokemon.Format,
            pokemon.Generation,
            pokemon.Version);
        return string.IsNullOrWhiteSpace(location)
            ? $"Lv. {pokemon.MetLevel}"
            : $"{location} · Lv. {pokemon.MetLevel}";
    }

    public static string? EntityBytesBase64(PKM pokemon)
    {
        if (pokemon.Species == 0)
            return null;

        return Convert.ToBase64String(pokemon.Data.ToArray());
    }

    private static PokemonMoveOption MoveOption(PKM pokemon, ushort move)
    {
        if (move == 0)
            return new PokemonMoveOption(0, "Empty", "None", 48, 0.04, 0);

        var typeId = MoveInfo.GetType(move, pokemon.Context);
        return new PokemonMoveOption(
            move,
            NameAt(GameInfo.Strings.Move, move) ?? $"Move {move}",
            TypeName(typeId) ?? "Move",
            TypeHue(typeId),
            TypeChroma(typeId),
            MoveInfo.GetPP(pokemon.Context, move));
    }

    private static int CurrentAbilityIndex(PKM pokemon)
    {
        if (pokemon.Format >= 6 && AbilityVerifier.IsValidAbilityBits(pokemon.AbilityNumber))
            return pokemon.AbilityNumber >> 1;

        var index = pokemon.PersonalInfo.GetIndexOfAbility(pokemon.Ability);
        if (index >= 2)
            return index;

        return pokemon.PIDAbility >= 0 ? pokemon.PIDAbility : index;
    }

    private static string? HeldItemUnavailableReason(PKM pokemon, ushort item, string name) =>
        ItemRestrictions.IsHeldItemAllowed(item, pokemon.Context)
            ? null
            : $"{name} is not supported by this Pokemon Entity format.";

    private static string NatureEffect(int nature)
    {
        var increased = nature / 5;
        var decreased = nature % 5;
        return increased == decreased
            ? "No stat change"
            : $"+{NatureStats[increased]}, -{NatureStats[decreased]}";
    }

    private static string? TypeName(int type) => NameAt(GameInfo.Strings.Types, type);

    private static string TeraTypeName(byte type)
    {
        var index = type == TeraTypeUtil.Stellar ? TeraTypeUtil.StellarTypeDisplayStringIndex : type;
        return TypeName(index) ?? $"Type {type}";
    }

    private static int TypeHue(int type) =>
        type >= 0 && type < TypeHues.Length ? TypeHues[type] : 48;

    private static double TypeChroma(int type) =>
        type >= 0 && type < TypeChromas.Length ? TypeChromas[type] : 0.09;

    private static string? NameAt(IReadOnlyList<string> names, int index) =>
        index >= 0 && index < names.Count && !string.IsNullOrWhiteSpace(names[index]) ? names[index] : null;
}
