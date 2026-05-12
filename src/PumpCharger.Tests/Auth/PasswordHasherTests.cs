using PumpCharger.Api.Services.Auth;

namespace PumpCharger.Tests.Auth;

public class PasswordHasherTests
{
    private readonly BcryptPasswordHasher _hasher = new();

    [Fact]
    public void Hash_then_verify_with_same_password_returns_true()
    {
        var hash = _hasher.Hash("correct horse battery staple");
        Assert.True(_hasher.Verify("correct horse battery staple", hash));
    }

    [Fact]
    public void Verify_rejects_wrong_password()
    {
        var hash = _hasher.Hash("real password");
        Assert.False(_hasher.Verify("wrong password", hash));
    }

    [Fact]
    public void Verify_returns_false_for_empty_hash()
    {
        Assert.False(_hasher.Verify("anything", string.Empty));
    }

    [Fact]
    public void Verify_returns_false_for_malformed_hash_rather_than_throwing()
    {
        Assert.False(_hasher.Verify("anything", "not-a-real-bcrypt-hash"));
    }

    [Fact]
    public void Different_calls_produce_different_hashes_for_same_password()
    {
        var h1 = _hasher.Hash("same");
        var h2 = _hasher.Hash("same");
        Assert.NotEqual(h1, h2);
        Assert.True(_hasher.Verify("same", h1));
        Assert.True(_hasher.Verify("same", h2));
    }
}
